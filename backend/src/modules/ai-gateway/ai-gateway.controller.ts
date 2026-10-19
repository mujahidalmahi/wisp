import { Body, Controller, Get, Post, Optional } from '@nestjs/common';
import { AiGatewayService } from './ai-gateway.service';
import { WispQueryRequestDto, WispResponseCardDto } from '../../common/dto/wisp-query.dto';

@Controller('wisp')
export class AiGatewayController {
  private readonly aiGatewayService: AiGatewayService;

  constructor(@Optional() aiGatewayService?: AiGatewayService) {
    this.aiGatewayService = aiGatewayService || new AiGatewayService();
  }

  @Get('features')
  listFeatures() {
    return {
      features: this.aiGatewayService.listRegisteredFeatures(),
    };
  }

  @Post('query')
  async queryWisp(@Body() dto: WispQueryRequestDto): Promise<WispResponseCardDto> {
    return this.aiGatewayService.processWispQuery(dto);
  }
}
