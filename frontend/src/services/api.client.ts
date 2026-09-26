import { InMemoryCatalogContextSource } from '@wisp/ai-engine';
import { EnvConfig } from '../config/env';
import { InstantSceneContext, WispQueryRequest, WispResponseCard } from '../types/wisp';

const standaloneContextFallback = new InMemoryCatalogContextSource();

export class WispApiClient {
  /**
   * Fetches Stage-1 Instant Scene Context from NestJS/Cloudflare Edge,
   * or seamlessly falls back to @wisp/ai-engine's standalone in-memory
   * temporal filter if the backend/database is not running.
   */
  static async fetchInstantSceneContext(
    episodeId: string,
    playbackMs: number,
  ): Promise<InstantSceneContext> {
    const url = `${EnvConfig.apiBaseUrl}/context/${episodeId}?playbackMs=${Math.floor(playbackMs)}`;
    try {
      const response = await fetch(url);
      if (response.ok) {
        return (await response.json()) as InstantSceneContext;
      }
    } catch {
      // Backend offline during standalone UI/AI development -> use @wisp/ai-engine local temporal filter
    }
    return (await standaloneContextFallback.getSpoilerSafeContext(
      episodeId,
      playbackMs,
    )) as unknown as InstantSceneContext;
  }

  static async queryWispAi(payload: WispQueryRequest): Promise<WispResponseCard> {
    const url = `${EnvConfig.apiBaseUrl}/wisp/query`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Wisp AI request failed (${response.status}): ${errorText}`);
    }

    return (await response.json()) as WispResponseCard;
  }
}
