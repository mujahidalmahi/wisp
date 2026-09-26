import { Controller, Get, Param, ParseIntPipe, Query } from '@nestjs/common';
import { ContextService } from './context.service';

@Controller('context')
export class ContextController {
  constructor(private readonly contextService: ContextService) {}

  /**
   * Stage-1 Instant UI endpoint: returns the pre-computed scene header and
   * zero-typing quick action chips in <50ms when the viewer invokes Wisp.
   */
  @Get(':episodeId')
  async getInstantSceneContext(
    @Param('episodeId') episodeId: string,
    @Query('playbackMs', new ParseIntPipe({ optional: true })) playbackMs = 30000,
  ) {
    return this.contextService.getSpoilerSafeContext(episodeId, playbackMs);
  }
}
