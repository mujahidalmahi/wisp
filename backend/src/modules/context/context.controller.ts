import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Response } from 'express';
import { ContextService } from './context.service';
import { GetContextQueryDto } from './dto/get-context-query.dto';
import { GetBootstrapQueryDto } from './dto/get-bootstrap-query.dto';
import { HybridRagSearchDto } from './dto/hybrid-rag-search.dto';
import { TranscriptSearchQueryDto } from './dto/transcript-search-query.dto';
import { CrossEpisodeQueryDto } from './dto/cross-episode-query.dto';
import { EpisodeQuizQueryDto } from './dto/quiz-query.dto';
import { DeviceAuthGuard } from '../../common/guards/device-auth.guard';
import { CurrentDevice } from '../../common/decorators/current-device.decorator';
import { ParseEpisodeIdPipe } from '../../common/pipes/parse-episode-id.pipe';

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
    @Param('episodeId', ParseEpisodeIdPipe) episodeId: string,
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
    @Param('episodeId', ParseEpisodeIdPipe) episodeId: string,
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

  /**
   * Advanced Hybrid Reciprocal Rank Fusion (RRF) RAG Search:
   * Fuses lexical full-text search, trigram matching, and vector cosine similarity.
   * Strictly bounded by playbackPositionMs (anti-spoiler).
   */
  @Post(':episodeId/rag-search')
  @HttpCode(HttpStatus.OK)
  async hybridRagSearch(
    @Param('episodeId', ParseEpisodeIdPipe) episodeId: string,
    @Body() dto: HybridRagSearchDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const safeMs = Math.max(0, dto.playbackPositionMs ?? 0);
    res.setHeader('Cache-Control', 'private, no-cache, no-transform');
    res.setHeader('X-Wisp-Temporal-Floor-Ms', safeMs.toString());

    return this.contextService.hybridRagSearch(episodeId, dto);
  }

  /**
   * Spoiler-Safe Transcript Dialogue Search:
   * Returns matching lines strictly where end_time_ms <= playbackMs.
   */
  @Get(':episodeId/transcript-search')
  async searchTranscript(
    @Param('episodeId', ParseEpisodeIdPipe) episodeId: string,
    @Query() query: TranscriptSearchQueryDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const safeMs = Math.max(0, query.playbackMs ?? 0);
    res.setHeader('Cache-Control', 'private, no-cache, no-transform');
    res.setHeader('X-Wisp-Temporal-Floor-Ms', safeMs.toString());

    return this.contextService.searchTranscript(episodeId, safeMs, query.query, query.limit);
  }

  /**
   * Cross-Episode / Multi-Season Context Resolution:
   * Unlocks 100% of completed prior episodes and 0..playbackMs of current episode.
   * Strictly blocks future episodes.
   */
  @Get(':episodeId/cross-episode')
  async getCrossEpisodeContext(
    @Param('episodeId', ParseEpisodeIdPipe) episodeId: string,
    @Query() query: CrossEpisodeQueryDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const safeMs = Math.max(0, query.playbackMs ?? 0);
    res.setHeader('Cache-Control', 'private, no-cache, no-transform');
    res.setHeader('X-Wisp-Temporal-Floor-Ms', safeMs.toString());

    return this.contextService.getCrossEpisodeContext(episodeId, safeMs);
  }

  /**
   * Post-Watch Trivia Quiz API:
   * Returns multiple-choice trivia unlocked up to playbackMs.
   */
  @Get(':episodeId/quiz')
  async getEpisodePostWatchQuiz(
    @Param('episodeId', ParseEpisodeIdPipe) episodeId: string,
    @Query() query: EpisodeQuizQueryDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const safeMs = Math.max(0, query.playbackMs ?? 0);
    res.setHeader('Cache-Control', 'private, no-cache, no-transform');
    res.setHeader('X-Wisp-Temporal-Floor-Ms', safeMs.toString());

    return this.contextService.getPostWatchQuiz(
      episodeId,
      safeMs,
      query.profileMode,
      query.limit,
    );
  }
}
