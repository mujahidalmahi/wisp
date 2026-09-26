import type { IContextSource, RawEpisodeDataset, TemporalProgramContext } from '../types/index.ts';
import { EMBEDDED_DEMO_EPISODES } from './embedded-catalog.ts';
import { filterContextByTimestamp } from './temporal-filter.ts';

export class InMemoryCatalogContextSource implements IContextSource {
  readonly sourceName = 'in-memory-catalog';
  private readonly episodes = new Map<string, RawEpisodeDataset>();

  constructor(initialCatalog: Record<string, RawEpisodeDataset> = EMBEDDED_DEMO_EPISODES) {
    Object.entries(initialCatalog).forEach(([id, data]) => {
      this.episodes.set(id, data);
    });
  }

  registerEpisode(dataset: RawEpisodeDataset): void {
    this.episodes.set(dataset.episodeId, dataset);
  }

  async getSpoilerSafeContext(
    episodeId: string,
    playbackPositionMs: number,
    lookbackMs = 180000,
  ): Promise<TemporalProgramContext> {
    const dataset = this.episodes.get(episodeId) || this.episodes.values().next().value!;
    return filterContextByTimestamp(dataset, playbackPositionMs, lookbackMs);
  }
}

export type PrimaryContextFetcher = (
  episodeId: string,
  playbackPositionMs: number,
  lookbackMs: number,
) => Promise<TemporalProgramContext | null>;

export class HybridContextSource implements IContextSource {
  readonly sourceName = 'hybrid-context-source';
  private readonly primaryFetcher?: PrimaryContextFetcher;
  private readonly fallbackSource: InMemoryCatalogContextSource;

  constructor(primaryFetcher?: PrimaryContextFetcher, fallbackSource?: InMemoryCatalogContextSource) {
    this.primaryFetcher = primaryFetcher;
    this.fallbackSource = fallbackSource || new InMemoryCatalogContextSource();
  }

  getFallbackCatalog(): InMemoryCatalogContextSource {
    return this.fallbackSource;
  }

  async getSpoilerSafeContext(
    episodeId: string,
    playbackPositionMs: number,
    lookbackMs = 180000,
  ): Promise<TemporalProgramContext> {
    if (this.primaryFetcher) {
      try {
        const result = await this.primaryFetcher(episodeId, playbackPositionMs, lookbackMs);
        if (result) {
          return result;
        }
      } catch {
        // Fallback to standalone in-memory catalog
      }
    }
    return this.fallbackSource.getSpoilerSafeContext(episodeId, playbackPositionMs, lookbackMs);
  }
}
