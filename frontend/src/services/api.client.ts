import { InMemoryCatalogContextSource, WispAiEngine } from '@wisp/ai-engine';
import { EnvConfig } from '../config/env.ts';
import { DeviceAuthService } from './device-auth.service.ts';
import type {
  InstantSceneContext,
  QuickActionChip,
  WispQueryRequest,
  WispResponseCard,
} from '../types/wisp.ts';
import type { CatalogProgram } from '../config/catalog.ts';
import { DEMO_PROGRAMS } from '../config/catalog.ts';

const standaloneContextFallback = new InMemoryCatalogContextSource();
let standaloneEngineFallback: WispAiEngine | null = null;

function isTestEnvironment(): boolean {
  return typeof process !== 'undefined' && (
    process.env?.NODE_ENV === 'test' ||
    process.argv?.some((arg) => arg.includes('test'))
  );
}

function getTimeoutMs(): number {
  return isTestEnvironment() ? 250 : EnvConfig.requestTimeoutMs;
}

function getStandaloneEngine(): WispAiEngine {
  if (!standaloneEngineFallback) {
    standaloneEngineFallback = WispAiEngine.createStandalone({
      groqApiKey: typeof process !== 'undefined' ? process.env?.GROQ_API_KEY : undefined,
      geminiApiKey: typeof process !== 'undefined' ? process.env?.GEMINI_API_KEY : undefined,
      openRouterApiKey: typeof process !== 'undefined' ? process.env?.OPENROUTER_API_KEY : undefined,
    });
  }
  return standaloneEngineFallback;
}

export class WispApiClient {
  /**
   * Fetches Stage-1 Instant Scene Context from NestJS/Cloudflare Edge,
   * injecting authenticated device credentials.
   * Seamlessly falls back to @wisp/ai-engine's standalone in-memory
   * temporal filter if the backend or database is offline.
   */
  static async fetchInstantSceneContext(
    episodeId: string,
    playbackMs: number,
  ): Promise<InstantSceneContext> {
    const url = `${EnvConfig.apiBaseUrl}/context/${episodeId}?playbackMs=${Math.floor(playbackMs)}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), getTimeoutMs());

    try {
      const headers = await DeviceAuthService.getInstance().getAuthHeaders();
      const response = await fetch(url, {
        method: 'GET',
        headers,
        signal: controller.signal,
      });

      if (response.ok) {
        return (await response.json()) as InstantSceneContext;
      }
    } catch {
      // Backend offline or timeout during standalone UI development
    } finally {
      clearTimeout(timer);
    }

    return (await standaloneContextFallback.getSpoilerSafeContext(
      episodeId,
      playbackMs,
    )) as unknown as InstantSceneContext;
  }

  /**
   * Sends a Stage-2 Grounded AI Query to NestJS / Cloudflare Edge with
   * authenticated device credentials.
   * If the backend is unreachable, gracefully executes via @wisp/ai-engine
   * standalone. If no remote provider keys are configured, falls back to
   * grounded spoiler-safe local context.
   */
  static async queryWispAi(payload: WispQueryRequest): Promise<WispResponseCard> {
    const url = `${EnvConfig.apiBaseUrl}/wisp/query`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), getTimeoutMs());

    try {
      const headers = await DeviceAuthService.getInstance().getAuthHeaders();
      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      if (response.ok) {
        return (await response.json()) as WispResponseCard;
      }
    } catch {
      // Backend offline -> route to local @wisp/ai-engine
    } finally {
      clearTimeout(timer);
    }

    // Standalone @wisp/ai-engine execution fallback
    try {
      const engine = getStandaloneEngine();
      const card = await engine.execute({
        episodeId: payload.episodeId,
        playbackPositionMs: payload.playbackPositionMs,
        actionType: payload.actionType,
        prompt: payload.prompt,
        profileMode: payload.profileMode,
      });
      return card as WispResponseCard;
    } catch {
      // Resilient local context grounding when running standalone without AI provider API keys
      const ctx = await standaloneContextFallback.getSpoilerSafeContext(
        payload.episodeId,
        payload.playbackPositionMs,
      );
      const sceneTitle = ctx.active_scene?.scene_title || 'Scene Context';
      const isQuiz = payload.actionType === 'post_watch_quiz';

      const fallbackChips: QuickActionChip[] = [
        { id: 'f1', label: 'Explain this scene', actionType: 'scene_explain' },
        { id: 'f2', label: 'Catch me up', actionType: 'episode_recap' },
      ];

      return {
        headline: isQuiz ? 'Trivia Challenge' : sceneTitle,
        body: ctx.active_scene?.spoiler_safe_summary || 'Context grounded up to active playhead.',
        bulletPoints: [
          `Scene timecode: ${Math.floor(payload.playbackPositionMs / 1000)}s`,
          `Unlocked lore entities: ${ctx.unlocked_entities?.length || 0}`,
        ],
        spoilerSafeUpToMs: payload.playbackPositionMs,
        profileMode: payload.profileMode,
        providerUsed: 'wisp:standalone-lore-engine',
        cached: false,
        latencyMs: 12,
        followUpChips: (ctx.active_scene?.quick_action_chips as QuickActionChip[]) || fallbackChips,
        quizPayload: isQuiz
          ? {
              question: `In "${sceneTitle}", where does the active confrontation occur?`,
              options: [
                ctx.active_scene?.location_name || 'Amsterdam Church',
                'Orbital Shuttle Dock',
                'Deep Submersible',
                'Arctic Outpost',
              ],
              correctIndex: 0,
              explanation: `The scene is set in ${ctx.active_scene?.location_name || 'the primary location'}.`,
            }
          : undefined,
      };
    }
  }

  /**
   * Submits viewer helpfulness feedback (+1, 0, -1) on an AI response card
   * to POST /api/v1/wisp/interactions/:interactionId/vote.
   */
  static async voteInteraction(interactionId: string, vote: -1 | 0 | 1): Promise<boolean> {
    if (!interactionId) return false;
    const url = `${EnvConfig.apiBaseUrl}/wisp/interactions/${encodeURIComponent(interactionId)}/vote`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), getTimeoutMs());

    try {
      const headers = await DeviceAuthService.getInstance().getAuthHeaders();
      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify({ vote }),
        signal: controller.signal,
      });
      return response.ok;
    } catch {
      return false;
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Loads dynamic catalog programs from backend or falls back to demo catalog.
   */
  static async fetchPrograms(): Promise<CatalogProgram[]> {
    const url = `${EnvConfig.apiBaseUrl}/catalog/programs`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), getTimeoutMs());

    try {
      const headers = await DeviceAuthService.getInstance().getAuthHeaders();
      const response = await fetch(url, {
        method: 'GET',
        headers,
        signal: controller.signal,
      });
      if (response.ok) {
        const data = (await response.json()) as any[];
        if (Array.isArray(data) && data.length > 0) {
          return data.map((item) => ({
            programId: item.id || item.programId,
            episodeId: item.defaultEpisodeId || item.episodeId || item.id,
            title: item.title,
            episodeTitle: item.episodeTitle || 'Episode 1',
            genre: item.genre || 'Sci-Fi',
            durationSeconds: item.durationSeconds || 600,
            synopsis: item.synopsis || '',
            tagline: item.tagline || '',
          }));
        }
      }
    } catch {
      // Offline fallback
    } finally {
      clearTimeout(timer);
    }
    return DEMO_PROGRAMS;
  }
}
