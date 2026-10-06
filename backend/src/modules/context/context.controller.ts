import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Response } from 'express';
import { ContextService } from './context.service';
import { GetContextQueryDto } from './dto/get-context-query.dto';
import { GetBootstrapQueryDto } from './dto/get-bootstrap-query.dto';
import { DeviceAuthGuard } from '../../common/guards/device-auth.guard';
import { CurrentDevice } from '../../common/decorators/current-device.decorator';

@Controller('context')
@UseGuards(DeviceAuthGuard)
export class ContextController {
  constructor(private readonly contextService: ContextService) {}

  /**
   * Stage-1 Instant UI endpoint: returns the pre-computed scene header and
   * zero-typing quick action chips in <50ms when the viewer invokes Wisp.
   */
  @Get(':episodeId')
  async getInstantSceneContext(
    @Param('episodeId', new ParseUUIDPipe({ version: '4' })) episodeId: string,
    @Query() query: GetContextQueryDto,
    @CurrentDevice() _authenticatedDeviceId: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const playbackMs = Math.max(0, query.playbackMs ?? 0);
    const lookbackMs = Math.max(0, query.lookbackMs ?? 120000);

    res.setHeader('Cache-Control', 'private, no-cache, no-transform');
    res.setHeader('X-Wisp-Temporal-Floor-Ms', playbackMs.toString());

    return this.contextService.getSpoilerSafeContext(episodeId, playbackMs, lookbackMs);
  }

  /**
   * Stage-1 Single-Roundtrip Fire TV Bootstrap:
   * Returns active profile, active scene, quick action chips, verified pre-warmed cache cards,
   * and conversation session state in a single call.
   */
  @Get(':episodeId/bootstrap')
  async getFireTvBootstrap(
    @Param('episodeId', new ParseUUIDPipe({ version: '4' })) episodeId: string,
    @Query() query: GetBootstrapQueryDto,
    @CurrentDevice() authenticatedDeviceId: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const playbackMs = Math.max(0, query.playbackMs ?? 0);

    res.setHeader('Cache-Control', 'private, no-cache, no-transform');
    res.setHeader('X-Wisp-Temporal-Floor-Ms', playbackMs.toString());

    return this.contextService.getFireTvBootstrap(
      episodeId,
      authenticatedDeviceId,
      playbackMs,
      query.profileId,
    );
  }
}
