import {
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
  Res,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { Response } from 'express';
import * as crypto from 'crypto';
import { ConfigService } from '@nestjs/config';
import { ObservabilityService } from './observability.service';

@Controller('observability')
export class ObservabilityController {
  constructor(
    private readonly observabilityService: ObservabilityService,
    private readonly configService?: ConfigService,
  ) {}

  /**
   * Unified telemetry snapshot including catalog statistics, cache efficiency,
   * AI provider performance, latency percentiles, and spoiler safety audits.
   */
  @Get('summary')
  async getSummaryMetrics(@Res({ passthrough: true }) res: Response) {
    res.setHeader('Cache-Control', 'private, no-cache, no-transform');
    return this.observabilityService.getSummaryMetrics();
  }

  /**
   * Content curation depth and timeline coverage percentage across all episodes.
   */
  @Get('coverage')
  async getTemporalCoverage(@Res({ passthrough: true }) res: Response) {
    res.setHeader('Cache-Control', 'private, no-cache, no-transform');
    return this.observabilityService.getTemporalCoverage();
  }

  /**
   * AI provider throughput, success rates, token usage, and P50/P95/P99 latency percentiles.
   */
  @Get('providers')
  async getProviderPerformance(@Res({ passthrough: true }) res: Response) {
    res.setHeader('Cache-Control', 'private, no-cache, no-transform');
    return this.observabilityService.getProviderPerformance();
  }

  /**
   * Episode scene query engagement hotspots and helpfulness scores.
   */
  @Get('hotspots')
  async getEngagementHotspots(@Res({ passthrough: true }) res: Response) {
    res.setHeader('Cache-Control', 'private, no-cache, no-transform');
    return this.observabilityService.getEngagementHotspots();
  }

  /**
   * Performs automated database maintenance pruning expired AI cache entries,
   * expired viewing sessions, and stale rate limit windows.
   * Requires operator credentials when configured.
   */
  @Post('purge')
  @HttpCode(HttpStatus.OK)
  async purgeMaintenance(
    @Res({ passthrough: true }) res: Response,
    @Headers('x-operator-token') operatorToken?: string,
    @Headers('authorization') authHeader?: string,
  ) {
    res.setHeader('Cache-Control', 'private, no-cache, no-transform');

    const isProduction =
      (this.configService?.get<string>('NODE_ENV') || process.env.NODE_ENV) === 'production';

    const expectedToken =
      this.configService?.get<string>('INTERNAL_OPERATOR_TOKEN') ||
      this.configService?.get<string>('OPERATOR_TOKEN') ||
      process.env.INTERNAL_OPERATOR_TOKEN ||
      process.env.OPERATOR_TOKEN;

    if (!expectedToken || expectedToken.trim().length === 0) {
      if (isProduction) {
        throw new ServiceUnavailableException('Operator credentials not configured');
      }
    } else {
      const providedToken =
        (typeof operatorToken === 'string' && operatorToken.trim().length > 0
          ? operatorToken.trim()
          : undefined) ||
        (typeof authHeader === 'string' && authHeader.startsWith('Bearer ')
          ? authHeader.slice(7).trim()
          : undefined);

      if (!providedToken) {
        throw new UnauthorizedException('Operator credentials required for maintenance purge');
      }

      const cleanExpected = expectedToken.trim();
      const providedBuf = Buffer.from(providedToken);
      const expectedBuf = Buffer.from(cleanExpected);

      const isMatch =
        providedBuf.length === expectedBuf.length &&
        crypto.timingSafeEqual(providedBuf, expectedBuf);

      if (!isMatch) {
        throw new UnauthorizedException('Invalid operator credentials');
      }
    }

    return this.observabilityService.purgeMaintenance();
  }
}
