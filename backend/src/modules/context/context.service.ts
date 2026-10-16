import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  HybridContextSource,
  InMemoryCatalogContextSource,
  TemporalProgramContext,
  EMBEDDED_DEMO_EPISODES,
} from '@wisp/ai-engine';
import { SupabaseService } from '../supabase/supabase.service';
import { CatalogService } from '../catalog/catalog.service';
import { ProfilesService } from '../profiles/profiles.service';
import { HybridRagSearchDto } from './dto/hybrid-rag-search.dto';

export { TemporalProgramContext };

export interface QuickActionChipItem {
  id?: string;
  label: string;
  actionType?: string;
}

export interface Stage1BootstrapResponse {
  profile: {
    id: string;
    display_name: string;
    mode: string;
    spoiler_strictness: string;
    voice_tts_enabled: boolean;
  } | null;
  active_scene: {
    scene_index: number;
    title: string;
    scene_title: string;
    location_name?: string;
    start_time_ms: number;
    end_time_ms: number;
    summary: string;
    spoiler_safe_summary: string;
    quick_action_chips: QuickActionChipItem[];
  } | null;
  prewarmed_cards: Array<{
    action_type: string;
    provider: string;
    card: Record<string, any>;
  }>;
  session: {
    session_id: string;
    current_playback_ms: number;
    recent_turn_count: number;
    last_summary?: string;
    pinned_timestamps: number[];
  } | null;
  safe_playback_ms: number;
  episode_duration_ms: number;
}

@Injectable()
export class ContextService {
  private readonly logger = new Logger(ContextService.name);
  private readonly contextSource: HybridContextSource;
  private readonly inMemoryFallback = new InMemoryCatalogContextSource();

  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly catalogService: CatalogService,
    private readonly profilesService: ProfilesService,
  ) {
    this.contextSource = new HybridContextSource(
      async (episodeId, playbackPositionMs, lookbackMs) => {
        const client = this.supabaseService.getClient();
        if (!client) return null;

        const safeMs = Math.max(0, playbackPositionMs);
        const { data, error } = await this.supabaseService.executeWithRetry(async () =>
          client.rpc('get_spoiler_safe_context', {
            p_episode_id: episodeId,
            p_playback_ms: safeMs,
            p_lookback_ms: lookbackMs,
          }),
        );

        if (error || !data) {
          this.logger.warn(`Supabase RPC fallback to in-memory context: ${error?.message}`);
          return null;
        }
        return data as TemporalProgramContext;
      },
      this.inMemoryFallback,
    );
  }

  getHybridContextSource(): HybridContextSource {
    return this.contextSource;
  }

  private allowDemoFallback(isConfigured: boolean): boolean {
    const isProduction = process.env.NODE_ENV === 'production';
    return !isConfigured || (!isProduction && process.env.ENABLE_DEMO_FALLBACK === 'true');
  }

  async getSpoilerSafeContext(
    episodeId: string,
    playbackPositionMs: number,
    lookbackMs = 120000,
  ): Promise<TemporalProgramContext> {
    const safeMs = Math.max(0, playbackPositionMs);
    const isConfigured = this.supabaseService.isConfigured();
    const allowDemoFallback = this.allowDemoFallback(isConfigured);

    // Strict Production Database Path: Verify episode exists and do not fall back to demo fixtures on misses (Item 5)
    if (isConfigured) {
      const client = this.supabaseService.getClient()!;
      try {
        const { data, error } = await this.supabaseService.executeWithRetry(async () =>
          client.rpc('get_spoiler_safe_context', {
            p_episode_id: episodeId,
            p_playback_ms: safeMs,
            p_lookback_ms: lookbackMs,
          }),
        );

        if (error) {
          if (error.code === 'PGRST116' || error.code === 'P0002' || error.code === '22P02') {
            throw new NotFoundException(`Playable episode with ID '${episodeId}' not found`);
          }
          this.logger.error(`Database RPC get_spoiler_safe_context failed: ${error.message}`);
          if (!allowDemoFallback) {
            throw new ServiceUnavailableException(`Database context query failed: ${error.message}`);
          }
        } else if (data) {
          return data as TemporalProgramContext;
        } else {
          // Explicit Not Found when database returns null for unknown episode (Item 5)
          throw new NotFoundException(`Playable episode with ID '${episodeId}' not found`);
        }
      } catch (err: any) {
        if (err instanceof NotFoundException || err instanceof ServiceUnavailableException) throw err;
        this.logger.error(`Error querying database context: ${err?.message}`);
        if (!allowDemoFallback) {
          throw new ServiceUnavailableException('Database context query failed');
        }
      }
    }

    // Standalone fallback path with lookbackMs propagation and episode verification
    await this.catalogService.getEpisodeById(episodeId);
    return this.contextSource.getSpoilerSafeContext(episodeId, safeMs, lookbackMs);
  }

  /**
   * Stage-1 Single-Roundtrip Fire TV Bootstrap RPC
   * Fast-path latency critical: zero retries on bootstrap to guarantee predictable response times.
   */
  async getFireTvBootstrap(
    episodeId: string,
    deviceId: string,
    playbackPositionMs = 0,
    profileId?: string,
  ): Promise<Stage1BootstrapResponse> {
    const cleanDeviceId = deviceId.trim();
    const cleanProfileId = profileId ? profileId.trim() : undefined;
    const safeMs = Math.max(0, playbackPositionMs);
    const isConfigured = this.supabaseService.isConfigured();
    const allowDemoFallback = this.allowDemoFallback(isConfigured);

    // 1. Verify profile-to-device ownership and existence (fail fast on not-found or mismatch)
    if (cleanProfileId) {
      if (isConfigured) {
        const client = this.supabaseService.getClient()!;
        const { data: profileCheck, error: checkError } = await this.supabaseService.executeWithRetry(async () =>
          client
            .from('profiles')
            .select('id, device_id')
            .eq('id', cleanProfileId)
            .single(),
        );

        if (checkError?.code === 'PGRST116' || (!checkError && !profileCheck)) {
          throw new NotFoundException(`Profile '${cleanProfileId}' not found`);
        }
        if (profileCheck && profileCheck.device_id !== cleanDeviceId) {
          throw new ForbiddenException(
            `Profile '${cleanProfileId}' does not belong to device '${cleanDeviceId}'`,
          );
        }
        if (checkError && !allowDemoFallback) {
          throw new ServiceUnavailableException(`Database error verifying profile: ${checkError.message}`);
        }
      } else {
        const profile = await this.profilesService.getProfileById(cleanProfileId);
        if (!profile) {
          throw new NotFoundException(`Profile '${cleanProfileId}' not found`);
        }
        if (profile.device_id !== cleanDeviceId) {
          throw new ForbiddenException(
            `Profile '${cleanProfileId}' does not belong to device '${cleanDeviceId}'`,
          );
        }
      }
    }

    // 2. Production Database Path via get_firetv_stage1_bootstrap RPC
    if (isConfigured) {
      const client = this.supabaseService.getClient()!;
      try {
        const params: Record<string, any> = {
          p_episode_id: episodeId,
          p_device_id: cleanDeviceId,
          p_playback_ms: safeMs,
        };
        if (cleanProfileId) {
          params.p_profile_id = cleanProfileId;
        }

        // Fast-path latency critical: maxRetries: 0 so retries never block the bootstrap deadline (Item 13)
        const { data, error } = await this.supabaseService.executeWithRetry(
          async () => client.rpc('get_firetv_stage1_bootstrap', params),
          { maxRetries: 0 },
        );

        if (!error && data) {
          const payload = data as any;
          if (payload.found === false) {
            throw new NotFoundException(`Playable episode with ID '${episodeId}' not found`);
          }

          if (
            payload.active_scene &&
            (Object.keys(payload.active_scene).length === 0 ||
              (!payload.active_scene.title && !payload.active_scene.scene_title))
          ) {
            payload.active_scene = null;
          } else if (payload.active_scene) {
            payload.active_scene.title = payload.active_scene.title || payload.active_scene.scene_title;
            payload.active_scene.scene_title = payload.active_scene.scene_title || payload.active_scene.title;
            payload.active_scene.summary = payload.active_scene.summary || payload.active_scene.spoiler_safe_summary;
            payload.active_scene.spoiler_safe_summary =
              payload.active_scene.spoiler_safe_summary || payload.active_scene.summary;
            if (
              !payload.active_scene.quick_action_chips ||
              payload.active_scene.quick_action_chips.length === 0
            ) {
              payload.active_scene.quick_action_chips = this.getDefaultQuickActionChips();
            }
          }

          if (payload.session && Object.keys(payload.session).length === 0) {
            payload.session = null;
          }
          if (payload.profile && Object.keys(payload.profile).length === 0) {
            payload.profile = null;
          }

          return payload as Stage1BootstrapResponse;
        }

        if (error) {
          if (error.code === 'PGRST116' || error.code === 'P0002' || error.code === '22P02') {
            throw new NotFoundException(`Playable episode with ID '${episodeId}' not found`);
          }
          this.logger.error(`get_firetv_stage1_bootstrap RPC failed: ${error.message}`);
          if (!allowDemoFallback) {
            throw new ServiceUnavailableException(`Database bootstrap unavailable: ${error.message}`);
          }
        }
      } catch (err: any) {
        if (
          err instanceof NotFoundException ||
          err instanceof ForbiddenException ||
          err instanceof ServiceUnavailableException
        ) {
          throw err;
        }
        this.logger.error(`Error calling get_firetv_stage1_bootstrap: ${err?.message}`);
        if (!allowDemoFallback) {
          throw new ServiceUnavailableException('Database bootstrap unavailable');
        }
      }
    }

    // 3. Resilient In-Memory Fallback Path (only for standalone / unconfigured mode)
    const ep = await this.catalogService.getEpisodeById(episodeId);
    const episodeDurationMs = ep?.duration_ms ?? 0;
    const clampedPlaybackMs =
      episodeDurationMs > 0
        ? Math.min(Math.max(0, safeMs), episodeDurationMs)
        : Math.max(0, safeMs);

    const context = await this.inMemoryFallback.getSpoilerSafeContext(episodeId, clampedPlaybackMs);
    const activeScene = context.active_scene;

    // Resolve profile from storage if profileId provided; otherwise return null
    let resolvedProfile: Stage1BootstrapResponse['profile'] = null;
    if (cleanProfileId) {
      const p = await this.profilesService.getProfileById(cleanProfileId);
      if (!p) {
        throw new NotFoundException(`Profile '${cleanProfileId}' not found`);
      }
      if (p.device_id !== cleanDeviceId) {
        throw new ForbiddenException(
          `Profile '${cleanProfileId}' does not belong to device '${cleanDeviceId}'`,
        );
      }
      resolvedProfile = {
        id: p.id,
        display_name: p.display_name,
        mode: p.mode,
        spoiler_strictness: p.spoiler_strictness,
        voice_tts_enabled: p.voice_tts_enabled,
      };
    }

    const chips: QuickActionChipItem[] =
      activeScene?.quick_action_chips && activeScene.quick_action_chips.length >= 2
        ? activeScene.quick_action_chips.map((c) => ({
            id: c.id,
            label: c.label,
            actionType: c.actionType,
          }))
        : this.getDefaultQuickActionChips();

    return {
      profile: resolvedProfile,
      active_scene: activeScene
        ? {
            scene_index: activeScene.scene_index,
            title: activeScene.scene_title,
            scene_title: activeScene.scene_title,
            location_name: activeScene.location_name,
            start_time_ms: 0,
            end_time_ms: Math.min(
              clampedPlaybackMs + 30000,
              episodeDurationMs > 0 ? episodeDurationMs : clampedPlaybackMs + 30000,
            ),
            summary: activeScene.spoiler_safe_summary,
            spoiler_safe_summary: activeScene.spoiler_safe_summary,
            quick_action_chips: chips,
          }
        : null,
      prewarmed_cards: activeScene
        ? [
            {
              action_type: 'scene_explain',
              provider: 'groq',
              card: {
                headline: 'Active Scene Context',
                summary: activeScene.spoiler_safe_summary,
                spoilerSafeUpToMs: clampedPlaybackMs,
                followUpActions: ['Tell me more', 'Characters here'],
              },
            },
          ]
        : [],
      session: null, // Do not fabricate fake session IDs (Item 7)
      safe_playback_ms: clampedPlaybackMs,
      episode_duration_ms: episodeDurationMs,
    };
  }

  /**
   * Advanced Hybrid Reciprocal Rank Fusion (RRF) RAG Search:
   * Fuses lexical full-text search, trigram matching, and vector cosine similarity.
   * Strictly bounded by playbackPositionMs (anti-spoiler).
   */
  async hybridRagSearch(episodeId: string, dto: HybridRagSearchDto): Promise<any[]> {
    const safePlaybackMs = Math.max(0, dto.playbackPositionMs ?? 0);
    const limit = Math.max(1, Math.min(20, dto.limit ?? 6));
    const isConfigured = this.supabaseService.isConfigured();
    const allowDemoFallback = this.allowDemoFallback(isConfigured);

    if (isConfigured) {
      const client = this.supabaseService.getClient()!;
      try {
        const { data, error } = await this.supabaseService.executeWithRetry(async () =>
          client.rpc('hybrid_spoiler_safe_rag_search', {
            p_episode_id: episodeId,
            p_playback_ms: safePlaybackMs,
            p_query_text: dto.queryText,
            p_query_vector: dto.queryVector ?? null,
            p_limit: limit,
          }),
        );

        if (error) {
          if (error.code === 'PGRST116' || error.code === 'P0002' || error.code === '22P02') {
            throw new NotFoundException(`Playable episode with ID '${episodeId}' not found`);
          }
          this.logger.error(`Database RPC hybrid_spoiler_safe_rag_search failed: ${error.message}`);
          if (!allowDemoFallback) {
            throw new ServiceUnavailableException(`Database RAG search failed: ${error.message}`);
          }
        } else if (data) {
          return Array.isArray(data) ? data : [];
        }
      } catch (err: any) {
        if (err instanceof NotFoundException || err instanceof ServiceUnavailableException) throw err;
        this.logger.error(`Error executing hybrid RAG search: ${err?.message}`);
        if (!allowDemoFallback) {
          throw new ServiceUnavailableException('Database RAG search failed');
        }
      }
    }

    // In-memory fallback
    await this.catalogService.getEpisodeById(episodeId);
    return this.fallbackHybridRagSearch(episodeId, safePlaybackMs, dto.queryText, limit);
  }

  private fallbackHybridRagSearch(
    episodeId: string,
    playbackMs: number,
    queryText: string,
    limit: number,
  ): any[] {
    const dataset = EMBEDDED_DEMO_EPISODES[episodeId];
    if (!dataset) return [];

    const candidates: Array<{
      id: string;
      source_type: string;
      start_time_ms: number;
      end_time_ms: number;
      reveal_time_ms: number;
      content_text: string;
      lex_score: number;
      vec_score: number;
      rrf_score: number;
    }> = [];

    const cleanQuery = queryText.toLowerCase().trim();
    const terms = cleanQuery.split(/\s+/).filter(Boolean);

    // 1. Transcript segments
    dataset.transcriptSegments.forEach((seg, idx) => {
      if (seg.endTimeMs <= playbackMs) {
        const text = `${seg.speaker}: ${seg.dialogue}`;
        const lower = text.toLowerCase();
        let matches = 0;
        terms.forEach((t) => {
          if (lower.includes(t)) matches++;
        });
        if (matches > 0 || cleanQuery === '') {
          const lexScore = matches / (terms.length || 1);
          candidates.push({
            id: `transcript-${idx}`,
            source_type: 'transcript_segment',
            start_time_ms: seg.startTimeMs,
            end_time_ms: seg.endTimeMs,
            reveal_time_ms: seg.endTimeMs,
            content_text: text,
            lex_score: lexScore,
            vec_score: 0,
            rrf_score: 1 / (60 + (candidates.length + 1)),
          });
        }
      }
    });

    // 2. Scene contexts
    dataset.scenes.forEach((scene) => {
      if (scene.endTimeMs <= playbackMs) {
        const text = `${scene.sceneTitle} - ${scene.locationName}: ${scene.spoilerSafeSummary}`;
        const lower = text.toLowerCase();
        let matches = 0;
        terms.forEach((t) => {
          if (lower.includes(t)) matches++;
        });
        if (matches > 0 || cleanQuery === '') {
          const lexScore = matches / (terms.length || 1);
          candidates.push({
            id: `scene-${scene.sceneIndex}`,
            source_type: 'scene_summary',
            start_time_ms: scene.startTimeMs,
            end_time_ms: scene.endTimeMs,
            reveal_time_ms: scene.endTimeMs,
            content_text: text,
            lex_score: lexScore,
            vec_score: 0,
            rrf_score: 1 / (60 + (candidates.length + 1)),
          });
        }
      }
    });

    return candidates
      .sort((a, b) => b.lex_score - a.lex_score || b.end_time_ms - a.end_time_ms)
      .slice(0, limit);
  }

  /**
   * Spoiler-Safe Transcript Dialogue Search:
   * Returns matching lines strictly where end_time_ms <= playbackMs.
   */
  async searchTranscript(
    episodeId: string,
    playbackMs: number,
    query: string,
    limit = 10,
  ): Promise<any[]> {
    const safePlaybackMs = Math.max(0, playbackMs ?? 0);
    const safeLimit = Math.max(1, Math.min(50, limit ?? 10));
    const isConfigured = this.supabaseService.isConfigured();
    const allowDemoFallback = this.allowDemoFallback(isConfigured);

    if (isConfigured) {
      const client = this.supabaseService.getClient()!;
      try {
        const { data, error } = await this.supabaseService.executeWithRetry(async () =>
          client.rpc('search_spoiler_safe_transcript', {
            p_episode_id: episodeId,
            p_playback_ms: safePlaybackMs,
            p_search_query: query,
            p_limit: safeLimit,
          }),
        );

        if (error) {
          if (error.code === 'PGRST116' || error.code === 'P0002' || error.code === '22P02') {
            throw new NotFoundException(`Playable episode with ID '${episodeId}' not found`);
          }
          this.logger.error(`Database RPC search_spoiler_safe_transcript failed: ${error.message}`);
          if (!allowDemoFallback) {
            throw new ServiceUnavailableException(`Database transcript search failed: ${error.message}`);
          }
        } else if (data) {
          return Array.isArray(data) ? data : [];
        }
      } catch (err: any) {
        if (err instanceof NotFoundException || err instanceof ServiceUnavailableException) throw err;
        this.logger.error(`Error searching transcript: ${err?.message}`);
        if (!allowDemoFallback) {
          throw new ServiceUnavailableException('Database transcript search failed');
        }
      }
    }

    // In-memory fallback
    await this.catalogService.getEpisodeById(episodeId);
    const dataset = EMBEDDED_DEMO_EPISODES[episodeId];
    if (!dataset) return [];

    const cleanQuery = query.toLowerCase().trim();
    return dataset.transcriptSegments
      .filter((seg) => seg.endTimeMs <= safePlaybackMs && seg.dialogue.toLowerCase().includes(cleanQuery))
      .slice(0, safeLimit)
      .map((seg) => ({
        start_time_ms: seg.startTimeMs,
        end_time_ms: seg.endTimeMs,
        speaker_name: seg.speaker,
        text: seg.dialogue,
      }));
  }

  /**
   * Cross-Episode / Multi-Season Context Resolution:
   * Unlocks 100% of completed prior episodes and 0..playbackMs of current episode.
   * Strictly blocks future episodes.
   */
  async getCrossEpisodeContext(episodeId: string, playbackMs: number): Promise<any> {
    const safePlaybackMs = Math.max(0, playbackMs ?? 0);
    const isConfigured = this.supabaseService.isConfigured();
    const allowDemoFallback = this.allowDemoFallback(isConfigured);

    if (isConfigured) {
      const client = this.supabaseService.getClient()!;
      try {
        const { data, error } = await this.supabaseService.executeWithRetry(async () =>
          client.rpc('get_cross_episode_spoiler_safe_context', {
            p_episode_id: episodeId,
            p_playback_ms: safePlaybackMs,
          }),
        );

        if (error) {
          if (error.code === 'PGRST116' || error.code === 'P0002' || error.code === '22P02') {
            throw new NotFoundException(`Playable episode with ID '${episodeId}' not found`);
          }
          this.logger.error(`Database RPC get_cross_episode_spoiler_safe_context failed: ${error.message}`);
          if (!allowDemoFallback) {
            throw new ServiceUnavailableException(`Database cross-episode query failed: ${error.message}`);
          }
        } else if (data) {
          return data;
        }
      } catch (err: any) {
        if (err instanceof NotFoundException || err instanceof ServiceUnavailableException) throw err;
        this.logger.error(`Error querying cross-episode context: ${err?.message}`);
        if (!allowDemoFallback) {
          throw new ServiceUnavailableException('Database cross-episode query failed');
        }
      }
    }

    // In-memory fallback
    await this.catalogService.getEpisodeById(episodeId);
    const currentEpisodeContext = await this.getSpoilerSafeContext(episodeId, safePlaybackMs);
    return {
      found: true,
      prior_episodes: [],
      current_episode: currentEpisodeContext,
    };
  }

  /**
   * Post-Watch Trivia Quiz API:
   * Returns multiple-choice trivia unlocked up to playbackMs.
   */
  async getPostWatchQuiz(
    episodeId: string,
    playbackMs: number,
    profileMode = 'quick_glance',
    limit = 5,
  ): Promise<any[]> {
    const safePlaybackMs = Math.max(0, playbackMs ?? 0);
    const safeLimit = Math.max(1, Math.min(20, limit ?? 5));
    const isConfigured = this.supabaseService.isConfigured();
    const allowDemoFallback = this.allowDemoFallback(isConfigured);

    if (isConfigured) {
      const client = this.supabaseService.getClient()!;
      try {
        const { data, error } = await this.supabaseService.executeWithRetry(async () =>
          client.rpc('get_episode_post_watch_quiz', {
            p_episode_id: episodeId,
            p_playback_ms: safePlaybackMs,
            p_profile_mode: profileMode,
            p_limit: safeLimit,
          }),
        );

        if (error) {
          if (error.code === 'PGRST116' || error.code === 'P0002' || error.code === '22P02') {
            throw new NotFoundException(`Playable episode with ID '${episodeId}' not found`);
          }
          this.logger.error(`Database RPC get_episode_post_watch_quiz failed: ${error.message}`);
          if (!allowDemoFallback) {
            throw new ServiceUnavailableException(`Database quiz query failed: ${error.message}`);
          }
        } else if (data) {
          return Array.isArray(data) ? data : [];
        }
      } catch (err: any) {
        if (err instanceof NotFoundException || err instanceof ServiceUnavailableException) throw err;
        this.logger.error(`Error querying episode quiz: ${err?.message}`);
        if (!allowDemoFallback) {
          throw new ServiceUnavailableException('Database quiz query failed');
        }
      }
    }

    // In-memory fallback: Return curated trivia if playbackMs allows
    await this.catalogService.getEpisodeById(episodeId);
    const demoQuizzes: Record<string, any[]> = {
      'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1': [
        {
          id: 'quiz-tos-1',
          unlock_time_ms: 120000,
          profile_mode: 'quick_glance',
          difficulty: 'medium',
          question: 'What key memory is Thom reconstructing inside the Oude Kerk?',
          options: [
            'The space elevator launch',
            'The bridge breakup with Celia 40 years ago',
            'The discovery of the robot factory',
            'The flight over New Amsterdam',
          ],
          correctIndex: 1,
          explanation:
            "Thom and Celia's personal dispute inadvertently broadcast emotional signals that caused the global robotic swarm to awaken.",
        },
      ],
      'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb3': [
        {
          id: 'quiz-sintel-1',
          unlock_time_ms: 60000,
          profile_mode: 'quick_glance',
          difficulty: 'easy',
          question: 'What first connected Sintel and the baby dragon Scales?',
          options: [
            'She stole a dragon egg from the monastery',
            'She nursed its broken wing in the desert oasis',
            'She tamed it with a magic spear',
            'They escaped a gladiator arena together',
          ],
          correctIndex: 1,
          explanation:
            'Sintel discovered Scales with a broken wing and spent months feeding it desert fowl until it regained strength to fly.',
        },
      ],
      'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb4': [
        {
          id: 'quiz-cosmos-1',
          unlock_time_ms: 120000,
          profile_mode: 'quick_glance',
          difficulty: 'hard',
          question: 'On the 365-day Cosmic Calendar, when does all recorded human history occur?',
          options: [
            'December 1st at midnight',
            'December 25th in the morning',
            'December 31st in the final 14 seconds',
            'November 15th during the ice age',
          ],
          correctIndex: 2,
          explanation:
            'All of human civilization, pyramids, wars, and technology occupy only the last 14 seconds of December 31st.',
        },
      ],
    };

    const quizzes = demoQuizzes[episodeId] || [];
    return quizzes
      .filter((q) => q.unlock_time_ms <= safePlaybackMs)
      .slice(0, safeLimit);
  }

  private getDefaultQuickActionChips(): QuickActionChipItem[] {
    return [
      { id: 'chip-scene', label: 'Explain Scene', actionType: 'scene_explain' },
      { id: 'chip-characters', label: 'Who is on screen?', actionType: 'character_identify' },
      { id: 'chip-recap', label: 'Quick Recap', actionType: 'recap' },
    ];
  }
}
