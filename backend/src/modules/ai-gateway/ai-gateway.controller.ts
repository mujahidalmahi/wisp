import { Body, Controller, Get, Logger, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AiGatewayService } from './ai-gateway.service';
import { WispQueryRequestDto, WispResponseCardDto } from '../../common/dto/wisp-query.dto';

@Controller('wisp')
export class AiGatewayController {
  private readonly logger = new Logger(AiGatewayController.name);

  constructor(private readonly aiGatewayService: AiGatewayService) {}

  @Get('features')
  listFeatures() {
    return {
      features: this.aiGatewayService.listRegisteredFeatures(),
    };
  }

  /**
   * AI query endpoint with tighter rate limit (12 req/60s) to protect
   * free-tier AI provider quotas (Groq/Gemini/OpenRouter) during demos.
   */
  @Post('query')
  @Throttle({ default: { limit: 12, ttl: 60000 } })
  async queryWisp(@Body() dto: WispQueryRequestDto): Promise<WispResponseCardDto> {
    const start = Date.now();
    this.logger.log(
      `AI query: action=${dto.actionType} episode=${dto.episodeId} playback=${dto.playbackPositionMs}ms profile=${dto.profileMode || 'quick_glance'}`,
    );

    const card = await this.aiGatewayService.processWispQuery(dto);

    this.logger.log(
      `AI query completed: action=${dto.actionType} latency=${Date.now() - start}ms`,
    );
    return card;
  }
}
