import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { WispAiEngine } from '@wisp/ai-engine';
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
    private readonly configService: ConfigService,
    private readonly contextService: ContextService,
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
