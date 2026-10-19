import { Injectable, Optional, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InMemoryCatalogContextSource, WispAiEngine } from '@wisp/ai-engine';
import { ContextService } from '../context/context.service';
import {
  HouseholdProfileMode,
  WispQueryRequestDto,
  WispResponseCardDto,
} from '../../common/dto/wisp-query.dto';

@Injectable()
export class AiGatewayService {
  private readonly engine: WispAiEngine;

  constructor(
    @Optional() private readonly configService?: ConfigService,
    @Optional() private readonly contextService?: ContextService,
  ) {
    const getEnv = (key: string) =>
      this.configService?.get<string>(key) || process.env[key];

    const contextSource =
      this.contextService?.getHybridContextSource() ||
      new InMemoryCatalogContextSource();

    this.engine = new WispAiEngine(
      {
        groqApiKey: getEnv('GROQ_API_KEY'),
        groqModel: getEnv('GROQ_MODEL'),
        geminiApiKey: getEnv('GEMINI_API_KEY'),
        geminiModel: getEnv('GEMINI_MODEL'),
        openRouterApiKey: getEnv('OPENROUTER_API_KEY'),
        openRouterModel: getEnv('OPENROUTER_MODEL'),
        ollamaBaseUrl: getEnv('OLLAMA_BASE_URL'),
        ollamaModel: getEnv('OLLAMA_MODEL'),
        enableCache: true,
      },
      contextSource,
    );
  }

  getEngine(): WispAiEngine {
    return this.engine;
  }

  listRegisteredFeatures() {
    return this.engine.listFeatures();
  }

  async processWispQuery(dto: WispQueryRequestDto): Promise<WispResponseCardDto> {
    try {
      const card = await this.engine.execute({
        episodeId: dto.episodeId,
        playbackPositionMs: dto.playbackPositionMs,
        actionType: dto.actionType,
        prompt: dto.prompt,
        profileMode: dto.profileMode || HouseholdProfileMode.QUICK_GLANCE,
      });
      return card as unknown as WispResponseCardDto;
    } catch (err: any) {
      throw new ServiceUnavailableException(err?.message || 'AI Engine execution failed');
    }
  }
}
