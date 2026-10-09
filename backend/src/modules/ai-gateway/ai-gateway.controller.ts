import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Logger,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AiGatewayService } from './ai-gateway.service';
import { WispQueryRequestDto, WispResponseCardDto } from '../../common/dto/wisp-query.dto';
import { VoteInteractionDto } from './dto/vote-interaction.dto';
import { DeviceAuthGuard } from '../../common/guards/device-auth.guard';
import { CurrentDevice } from '../../common/decorators/current-device.decorator';

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
  @UseGuards(DeviceAuthGuard)
  async queryWisp(
    @Body() dto: WispQueryRequestDto,
    @CurrentDevice() authenticatedDeviceId: string,
  ): Promise<WispResponseCardDto> {
    const start = Date.now();
    this.logger.log(
      `AI query: action=${dto.actionType} episode=${dto.episodeId} playback=${dto.playbackPositionMs}ms profile=${dto.profileMode || 'quick_glance'}`,
    );

    const card = await this.aiGatewayService.processWispQuery(dto, authenticatedDeviceId);

    this.logger.log(
      `AI query completed: action=${dto.actionType} latency=${Date.now() - start}ms`,
    );
    return card;
  }

  /**
   * Records viewer helpfulness feedback vote (-1, 0, 1) on an interaction card.
   * Device ownership is strictly verified. Supports both PATCH and POST for client compatibility.
   */
  @Patch('interactions/:interactionId/vote')
  @UseGuards(DeviceAuthGuard)
  @HttpCode(HttpStatus.OK)
  async voteInteraction(
    @Param('interactionId', new ParseUUIDPipe({ version: '4' })) interactionId: string,
    @Body() dto: VoteInteractionDto,
    @CurrentDevice() authenticatedDeviceId: string,
  ) {
    return this.aiGatewayService.voteInteraction(
      interactionId,
      dto.vote,
      authenticatedDeviceId,
    );
  }

  @Post('interactions/:interactionId/vote')
  @UseGuards(DeviceAuthGuard)
  @HttpCode(HttpStatus.OK)
  async voteInteractionPost(
    @Param('interactionId', new ParseUUIDPipe({ version: '4' })) interactionId: string,
    @Body() dto: VoteInteractionDto,
    @CurrentDevice() authenticatedDeviceId: string,
  ) {
    return this.voteInteraction(interactionId, dto, authenticatedDeviceId);
  }
}
