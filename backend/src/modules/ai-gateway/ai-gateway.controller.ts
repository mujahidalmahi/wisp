import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { AiGatewayService } from './ai-gateway.service';
import { WispQueryRequestDto, WispResponseCardDto } from '../../common/dto/wisp-query.dto';
import { VoteInteractionDto } from './dto/vote-interaction.dto';
import { DeviceAuthGuard } from '../../common/guards/device-auth.guard';
import { CurrentDevice } from '../../common/decorators/current-device.decorator';

@Controller('wisp')
export class AiGatewayController {
  constructor(private readonly aiGatewayService: AiGatewayService) {}

  @Get('features')
  listFeatures() {
    return {
      features: this.aiGatewayService.listRegisteredFeatures(),
    };
  }

  @Post('query')
  @UseGuards(DeviceAuthGuard)
  async queryWisp(
    @Body() dto: WispQueryRequestDto,
    @CurrentDevice() authenticatedDeviceId: string,
  ): Promise<WispResponseCardDto> {
    return this.aiGatewayService.processWispQuery(dto, authenticatedDeviceId);
  }

  /**
   * Records viewer helpfulness feedback vote (-1, 0, 1) on an interaction card.
   * Device ownership is strictly verified.
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
}
