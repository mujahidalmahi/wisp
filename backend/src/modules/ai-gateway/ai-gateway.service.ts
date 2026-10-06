import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { WispAiEngine } from '@wisp/ai-engine';
import { ContextService } from '../context/context.service';
import { SupabaseService } from '../supabase/supabase.service';
import {
  HouseholdProfileMode,
  WispQueryRequestDto,
  WispResponseCardDto,
} from '../../common/dto/wisp-query.dto';

interface InMemoryCacheEntry {
  payload: WispResponseCardDto;
  expiresAt: number;
}

interface InMemoryInteraction {
  id: string;
  deviceId?: string;
  profileId?: string;
  vote: number;
}

@Injectable()
export class AiGatewayService {
  private readonly logger = new Logger(AiGatewayService.name);
  private readonly engine: WispAiEngine;

  // In-memory temporal cache and interaction stores for unconfigured/test environments
  private readonly inMemoryAiCache = new Map<string, InMemoryCacheEntry>();
  private readonly inMemoryInteractions = new Map<string, InMemoryInteraction>();

  constructor(
    private readonly configService: ConfigService,
    private readonly contextService: ContextService,
    private readonly supabaseService: SupabaseService,
  ) {
    this.engine = new WispAiEngine(
      {
        groqApiKey: this.configService.get<string>('GROQ_API_KEY'),
        groqModel: this.configService.get<string>('GROQ_MODEL'),
        geminiApiKey: this.configService.get<string>('GEMINI_API_KEY'),
        geminiModel: this.configService.get<string>('GEMINI_MODEL'),
        openRouterApiKey: this.configService.get<string>('OPENROUTER_API_KEY'),
        openRouterModel: this.configService.get<string>('OPENROUTER_MODEL'),
        ollamaBaseUrl: this.configService.get<string>('OLLAMA_BASE_URL'),
        ollamaModel: this.configService.get<string>('OLLAMA_MODEL'),
        enableCache: true,
      },
      this.contextService.getHybridContextSource(),
    );
  }

  getEngine(): WispAiEngine {
    return this.engine;
  }

  listRegisteredFeatures() {
    return this.engine.listFeatures();
  }

  /**
   * Calculates the 15-second temporal bucket according to the formula:
   * timeBucketSec = floor(playbackPositionMs / 15000) * 15
   */
  computeTimeBucketSec(playbackPositionMs: number): number {
    const safeMs = Math.max(0, playbackPositionMs || 0);
    return Math.floor(safeMs / 15000) * 15;
  }

  /**
   * Deterministic cache key generation:
   * <episodeId>:<actionType>:<profileMode>:<timeBucketSec>
   */
  computeCacheKey(
    episodeId: string,
    actionType: string,
    profileMode: string,
    timeBucketSec: number,
  ): string {
    return `${episodeId.trim()}:${actionType.trim()}:${profileMode.trim()}:${timeBucketSec}`;
  }

  /**
   * Processes a Wisp AI query traversing the deterministic 15-second temporal cache first.
   * If cache hit occurs, returns the card in <10ms without invoking the external LLM pipeline.
   * If cache miss occurs, invokes the real AI engine and persists the result to the cache.
   */
  async processWispQuery(dto: WispQueryRequestDto): Promise<WispResponseCardDto> {
    const profileMode = dto.profileMode || HouseholdProfileMode.QUICK_GLANCE;
    const timeBucketSec = this.computeTimeBucketSec(dto.playbackPositionMs);
    const cacheKey = this.computeCacheKey(
      dto.episodeId,
      dto.actionType,
      profileMode,
      timeBucketSec,
    );

    // 1. Check Temporal AI Response Cache BEFORE invoking external LLM
    if (this.supabaseService.isConfigured()) {
      try {
        const startHit = Date.now();
        const { data: cachedPayload, error: cacheErr } =
          await this.supabaseService.executeRpc<Record<string, any>>(
            'get_or_touch_ai_cache',
            { p_cache_key: cacheKey },
          );

        if (!cacheErr && cachedPayload && typeof cachedPayload === 'object' && Object.keys(cachedPayload).length > 0) {
          const latencyMs = Date.now() - startHit;
          return {
            ...(cachedPayload as any),
            cached: true,
            latencyMs,
          } as WispResponseCardDto;
        }
      } catch (err: any) {
        this.logger.warn(`AI cache read error: ${err?.message}. Proceeding to AI pipeline.`);
      }
    } else {
      // In-memory cache check for tests/unconfigured mode
      const inMem = this.inMemoryAiCache.get(cacheKey);
      if (inMem && inMem.expiresAt > Date.now()) {
        return {
          ...inMem.payload,
          cached: true,
          latencyMs: 1,
        };
      }
    }

    // 2. Cache Miss: Execute real AI pipeline
    let card: any;
    const startExec = Date.now();
    try {
      card = await this.engine.execute({
        episodeId: dto.episodeId,
        playbackPositionMs: dto.playbackPositionMs,
        actionType: dto.actionType,
        prompt: dto.prompt,
        profileMode,
      });
    } catch (err: any) {
      throw new ServiceUnavailableException(err?.message || 'AI Engine execution failed');
    }
    const originLatencyMs = Date.now() - startExec;

    const responseCard: WispResponseCardDto = {
      ...(card as unknown as WispResponseCardDto),
      cached: false,
      latencyMs: originLatencyMs,
    };

    // 3. Persist generated response to 15-second temporal cache
    if (this.supabaseService.isConfigured()) {
      try {
        await this.supabaseService.executeRpc('upsert_ai_response_cache', {
          p_cache_key: cacheKey,
          p_episode_id: dto.episodeId,
          p_action_type: dto.actionType,
          p_profile_mode: profileMode,
          p_time_bucket_sec: timeBucketSec,
          p_provider_used: responseCard.providerUsed || 'groq',
          p_response_payload: responseCard,
          p_origin_latency_ms: originLatencyMs,
          p_token_count: null,
          p_ttl_seconds: 86400,
        });
      } catch (err: any) {
        this.logger.warn(`Failed to upsert to ai_response_cache: ${err?.message}`);
      }
    } else {
      this.inMemoryAiCache.set(cacheKey, {
        payload: responseCard,
        expiresAt: Date.now() + 86400 * 1000,
      });
    }

    return responseCard;
  }

  /**
   * Persists viewer helpfulness voting (-1, 0, 1) on an interaction record.
   * Enforces device ownership verification.
   */
  async voteInteraction(
    interactionId: string,
    vote: number,
    authenticatedDeviceId: string,
  ): Promise<{ success: boolean; interactionId: string; vote: number }> {
    if (this.supabaseService.isConfigured()) {
      const client = this.supabaseService.getClient();
      if (!client) throw new ServiceUnavailableException('Database client unavailable');

      // 1. Fetch interaction record
      const { data: interaction, error } = await client
        .from('interaction_history')
        .select('id, profile_id')
        .eq('id', interactionId)
        .maybeSingle();

      if (error) {
        throw new ServiceUnavailableException(`Database error: ${error.message}`);
      }
      if (!interaction) {
        throw new NotFoundException(`Interaction with ID '${interactionId}' not found`);
      }

      // 2. Validate device ownership if linked to a profile (fail-closed)
      if (interaction.profile_id) {
        const { data: profile, error: profileErr } = await client
          .from('profiles')
          .select('device_id')
          .eq('id', interaction.profile_id)
          .maybeSingle();

        if (profileErr) {
          throw new ServiceUnavailableException(`Database error verifying profile: ${profileErr.message}`);
        }

        if (!profile || profile.device_id !== authenticatedDeviceId) {
          throw new ForbiddenException(
            `Interaction does not belong to authenticated device '${authenticatedDeviceId}'`,
          );
        }
      }

      // 3. Persist vote into interaction_history
      const { error: updateErr } = await client
        .from('interaction_history')
        .update({ user_helpful_vote: vote })
        .eq('id', interactionId);

      if (updateErr) {
        throw new ServiceUnavailableException(`Failed to record vote: ${updateErr.message}`);
      }

      return {
        success: true,
        interactionId,
        vote,
      };
    }

    // In-memory fallback path
    const inMem = this.inMemoryInteractions.get(interactionId);
    if (!inMem) {
      throw new NotFoundException(`Interaction with ID '${interactionId}' not found`);
    }
    if (inMem.deviceId && inMem.deviceId !== authenticatedDeviceId) {
      throw new ForbiddenException(
        `Interaction does not belong to authenticated device '${authenticatedDeviceId}'`,
      );
    }
    inMem.vote = vote;
    return {
      success: true,
      interactionId,
      vote,
    };
  }

  /**
   * Test / dev helper to register an interaction in memory.
   */
  registerInMemoryInteraction(
    interactionId: string,
    deviceId?: string,
    profileId?: string,
  ): void {
    this.inMemoryInteractions.set(interactionId, {
      id: interactionId,
      deviceId,
      profileId,
      vote: 0,
    });
  }
}
