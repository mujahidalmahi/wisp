import { Injectable, Logger, Optional } from '@nestjs/common';
import {
  HybridContextSource,
  InMemoryCatalogContextSource,
  TemporalProgramContext,
} from '@wisp/ai-engine';
import { SupabaseService } from '../supabase/supabase.service';

export { TemporalProgramContext };

@Injectable()
export class ContextService {
  private readonly logger = new Logger(ContextService.name);
  private readonly contextSource: HybridContextSource;

  constructor(@Optional() private readonly supabaseService?: SupabaseService) {
    this.contextSource = new HybridContextSource(
      async (episodeId, playbackPositionMs, lookbackMs) => {
        const client = this.supabaseService?.getClient();
        if (!client) return null;

        const { data, error } = await client.rpc('get_spoiler_safe_context', {
          p_episode_id: episodeId,
          p_playback_ms: playbackPositionMs,
          p_lookback_ms: lookbackMs,
        });

        if (error || !data) {
          this.logger.warn(`Supabase RPC fallback to @wisp/ai-engine in-memory catalog: ${error?.message}`);
          return null;
        }
        return data as TemporalProgramContext;
      },
      new InMemoryCatalogContextSource(),
    );
  }

  getHybridContextSource(): HybridContextSource {
    return this.contextSource;
  }

  async getSpoilerSafeContext(
    episodeId: string,
    playbackPositionMs: number,
  ): Promise<TemporalProgramContext> {
    return this.contextSource.getSpoilerSafeContext(episodeId, playbackPositionMs);
  }
}
