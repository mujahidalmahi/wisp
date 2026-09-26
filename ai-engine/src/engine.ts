import type {
  AiQueryInput,
  IAiFeatureModule,
  IAiModelAdapter,
  IContextSource,
  TemporalProgramContext,
  WispAiEngineConfig,
  WispResponseCard,
} from './types/index.ts';
import { InMemoryCatalogContextSource } from './context/context-sources.ts';
import { AiProviderRouter } from './providers/provider-router.ts';
import { AiFeatureRegistry } from './features/feature-registry.ts';

export class WispAiEngine {
  private readonly router: AiProviderRouter;
  private readonly features: AiFeatureRegistry;
  private contextSource: IContextSource;
  private readonly cache = new Map<string, WispResponseCard>();
  private readonly enableCache: boolean;

  constructor(
    config: WispAiEngineConfig = {},
    contextSource?: IContextSource,
    featureRegistry?: AiFeatureRegistry,
  ) {
    this.router = new AiProviderRouter(config);
    this.contextSource = contextSource || new InMemoryCatalogContextSource();
    this.features = featureRegistry || new AiFeatureRegistry();
    this.enableCache = config.enableCache ?? true;
  }

  static createStandalone(config: WispAiEngineConfig = {}): WispAiEngine {
    return new WispAiEngine(config, new InMemoryCatalogContextSource());
  }

  setContextSource(source: IContextSource): void {
    this.contextSource = source;
  }

  registerFeature(feature: IAiFeatureModule): void {
    this.features.register(feature);
  }

  registerModelAdapter(adapter: IAiModelAdapter, priority: 'first' | 'last' = 'last'): void {
    this.router.registerAdapter(adapter, priority);
  }

  listFeatures() {
    return this.features.listRegisteredFeatures();
  }

  async getInstantSceneContext(
    episodeId: string,
    playbackPositionMs: number,
  ): Promise<TemporalProgramContext> {
    return this.contextSource.getSpoilerSafeContext(episodeId, playbackPositionMs);
  }

  async execute(input: AiQueryInput): Promise<WispResponseCard> {
    const profileMode = input.profileMode || 'quick_glance';
    const timeBucketSec = Math.floor(input.playbackPositionMs / 15000) * 15;
    const cacheKey = `${input.episodeId}:${timeBucketSec}:${input.actionType}:${profileMode}:${input.prompt.toLowerCase().trim()}`;

    if (this.enableCache && !input.inlineContextOverride) {
      const cached = this.cache.get(cacheKey);
      if (cached) {
        return { ...cached, cached: true, latencyMs: 2 };
      }
    }

    const context =
      input.inlineContextOverride ||
      (await this.contextSource.getSpoilerSafeContext(input.episodeId, input.playbackPositionMs));

    const featureModule = this.features.resolve(input.actionType);
    const completionRequest = featureModule.buildPrompts(input, context, profileMode);
    const result = await this.router.completeWithFallback(completionRequest);

    const card = featureModule.formatResponseCard(
      result.rawText,
      input,
      context,
      profileMode,
      result.providerName,
      result.latencyMs,
    );

    if (this.enableCache && !input.inlineContextOverride) {
      this.cache.set(cacheKey, card);
    }

    return card;
  }
}
