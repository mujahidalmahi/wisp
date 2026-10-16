import 'reflect-metadata';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'crypto';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { ConfigService } from '@nestjs/config';
import {
  BadRequestException,
  ForbiddenException,
  HttpStatus,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { of } from 'rxjs';

import { SupabaseService } from '../dist/modules/supabase/supabase.service.js';
import { CatalogService } from '../dist/modules/catalog/catalog.service.js';
import { ProfilesService } from '../dist/modules/profiles/profiles.service.js';
import { ContextService } from '../dist/modules/context/context.service.js';
import { ContextController } from '../dist/modules/context/context.controller.js';
import { AiGatewayService } from '../dist/modules/ai-gateway/ai-gateway.service.js';
import { AiGatewayController } from '../dist/modules/ai-gateway/ai-gateway.controller.js';
import { ObservabilityService } from '../dist/modules/observability/observability.service.js';
import { ObservabilityController } from '../dist/modules/observability/observability.controller.js';
import {
  SpoilerFirewallInterceptor,
  enforceSpoilerFirewall,
  DEFAULT_FIREWALL_QUICK_ACTIONS,
} from '../dist/common/interceptors/spoiler-firewall.interceptor.js';
import { HybridRagSearchDto } from '../dist/modules/context/dto/hybrid-rag-search.dto.js';
import { TranscriptSearchQueryDto } from '../dist/modules/context/dto/transcript-search-query.dto.js';
import { CrossEpisodeQueryDto } from '../dist/modules/context/dto/cross-episode-query.dto.js';
import { EpisodeQuizQueryDto } from '../dist/modules/context/dto/quiz-query.dto.js';
import {
  HouseholdProfileMode,
  WispActionType,
  WispQueryRequestDto,
} from '../dist/common/dto/wisp-query.dto.js';

function createMockSupabase(handlers: {
  rpc?: (name: string, params: any) => Promise<{ data: any; error: any }>;
  from?: (table: string) => any;
}) {
  const service = Object.create(SupabaseService.prototype);
  (service as any).logger = { log: () => {}, warn: () => {}, error: () => {} };
  (service as any).isConfiguredFlag = true;
  (service as any).client = {
    rpc: handlers.rpc || (async () => ({ data: null, error: null })),
    from: handlers.from || (() => ({ select: () => ({}) })),
  };
  (service as any).isConfigured = () => true;
  (service as any).getClient = () => (service as any).client;
  (service as any).executeWithRetry = async (op: () => Promise<any>) => {
    try {
      const res = await op();
      return res || { data: null, error: null };
    } catch (e: any) {
      return { data: null, error: e };
    }
  };
  (service as any).executeRpc = async (name: string, params: any) => {
    try {
      const { data, error } = await (service as any).client.rpc(name, params);
      return { data, error: error ? error.message : null };
    } catch (e: any) {
      return { data: null, error: e?.message || 'RPC execution failed' };
    }
  };
  return service as SupabaseService;
}

function createUnconfiguredSupabase() {
  const service = Object.create(SupabaseService.prototype);
  (service as any).logger = { log: () => {}, warn: () => {}, error: () => {} };
  (service as any).isConfiguredFlag = false;
  (service as any).client = null;
  (service as any).isConfigured = () => false;
  (service as any).getClient = () => null;
  (service as any).executeRpc = async () => ({ data: null, error: 'Database not configured' });
  (service as any).executeWithRetry = async () => ({ data: null, error: 'Database not configured' });
  return service as SupabaseService;
}

function createMockResponse() {
  const headers: Record<string, string> = {};
  return {
    headers,
    setHeader(k: string, v: string) {
      headers[k.toLowerCase()] = v;
    },
    getHeader(k: string) {
      return headers[k.toLowerCase()];
    },
    status(_s: number) {
      return this;
    },
  } as any;
}

describe('Phase 3: Advanced Backend, Observability & Anti-Spoiler Firewall', () => {
  const mockConfig = new ConfigService({
    INTERNAL_OPERATOR_TOKEN: 'op-secret-key-1234',
  });
  const unconfiguredSupabase = createUnconfiguredSupabase();
  const catalogService = new CatalogService(unconfiguredSupabase);
  const profilesService = new ProfilesService(unconfiguredSupabase);
  const contextService = new ContextService(unconfiguredSupabase, catalogService, profilesService);
  const contextController = new ContextController(contextService);

  const episodeIdTOS = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1';
  const episodeIdSintel = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb3';

  // --------------------------------------------------------------------------
  // 1. Hybrid RAG Search (RRF Reciprocal Rank Fusion)
  // --------------------------------------------------------------------------
  describe('Hybrid RAG Search (POST /api/v1/context/:episodeId/rag-search)', () => {
    it('strictly validates HybridRagSearchDto fields', async () => {
      // Valid DTO
      const valid = plainToInstance(HybridRagSearchDto, {
        queryText: 'Thom hologram Celia',
        playbackPositionMs: 120000,
        limit: 5,
        queryVector: [0.1, 0.2, 0.3],
      });
      const validErrs = await validate(valid);
      assert.equal(validErrs.length, 0);

      // Invalid: missing queryText, negative playbackPositionMs, limit out of bounds
      const invalid = plainToInstance(HybridRagSearchDto, {
        queryText: '',
        playbackPositionMs: -50,
        limit: 100,
      });
      const invalidErrs = await validate(invalid);
      assert.ok(invalidErrs.length >= 2);
    });

    it('executes hybrid RAG search and enforces deterministic temporal boundary', async () => {
      const res = createMockResponse();
      const results = await contextController.hybridRagSearch(
        episodeIdTOS,
        {
          queryText: 'Celia',
          playbackPositionMs: 180000,
          limit: 10,
        },
        res,
      );

      assert.equal(res.getHeader('cache-control'), 'private, no-cache, no-transform');
      assert.equal(res.getHeader('x-wisp-temporal-floor-ms'), '180000');
      assert.ok(Array.isArray(results));

      // Invariant 3: deterministic spoiler boundary — no content chunk beyond playbackPositionMs
      for (const item of results) {
        assert.ok(
          item.end_time_ms <= 180000,
          `RAG item end_time_ms (${item.end_time_ms}) exceeded playbackPositionMs (180000)`,
        );
        assert.ok(typeof item.rrf_score === 'number');
        assert.ok(item.content_text.length > 0);
      }
    });

    it('rejects RAG search for non-existent episode with 404', async () => {
      const res = createMockResponse();
      await assert.rejects(
        async () =>
          contextController.hybridRagSearch(
            '00000000-0000-0000-0000-000000000099',
            { queryText: 'anything', playbackPositionMs: 50000 },
            res,
          ),
        NotFoundException,
      );
    });
  });

  // --------------------------------------------------------------------------
  // 2. Spoiler-Safe Transcript Search
  // --------------------------------------------------------------------------
  describe('Transcript Dialogue Search (GET /api/v1/context/:episodeId/transcript-search)', () => {
    it('validates TranscriptSearchQueryDto parameters', async () => {
      const valid = plainToInstance(TranscriptSearchQueryDto, {
        query: 'Thom',
        playbackMs: 60000,
        limit: 10,
      });
      const validErrs = await validate(valid);
      assert.equal(validErrs.length, 0);

      const invalid = plainToInstance(TranscriptSearchQueryDto, {
        query: '',
        limit: 0,
      });
      const invalidErrs = await validate(invalid);
      assert.ok(invalidErrs.length >= 1);
    });

    it('searches dialogue and strictly bounds lines where endTimeMs <= playbackMs', async () => {
      const res = createMockResponse();
      const lines = await contextController.searchTranscript(
        episodeIdTOS,
        {
          query: 'Thom',
          playbackMs: 120000,
          limit: 10,
        },
        res,
      );

      assert.equal(res.getHeader('x-wisp-temporal-floor-ms'), '120000');
      assert.ok(Array.isArray(lines));
      for (const line of lines) {
        assert.ok(line.end_time_ms <= 120000);
        assert.ok(line.text.toLowerCase().includes('thom') || line.speaker_name.toLowerCase().includes('thom'));
      }
    });
  });

  // --------------------------------------------------------------------------
  // 3. Cross-Episode / Multi-Season Context Resolution
  // --------------------------------------------------------------------------
  describe('Cross-Episode Context Resolution (GET /api/v1/context/:episodeId/cross-episode)', () => {
    it('returns completed prior episodes and spoiler-bounded current episode', async () => {
      const res = createMockResponse();
      const crossCtx = await contextController.getCrossEpisodeContext(
        episodeIdTOS,
        { playbackMs: 100000 },
        res,
      );

      assert.equal(res.getHeader('x-wisp-temporal-floor-ms'), '100000');
      assert.ok(crossCtx.found);
      assert.ok(Array.isArray(crossCtx.prior_episodes));
      assert.ok(crossCtx.current_episode);
      assert.equal(
        crossCtx.current_episode.metadata.playback_position_ms,
        100000,
      );
    });
  });

  // --------------------------------------------------------------------------
  // 4. Post-Watch Trivia Quiz API
  // --------------------------------------------------------------------------
  describe('Post-Watch Trivia Quiz API (GET /api/v1/context/:episodeId/quiz)', () => {
    it('validates EpisodeQuizQueryDto parameters', async () => {
      const valid = plainToInstance(EpisodeQuizQueryDto, {
        playbackMs: 300000,
        profileMode: 'deep_lore',
        limit: 5,
      });
      const validErrs = await validate(valid);
      assert.equal(validErrs.length, 0);

      const invalid = plainToInstance(EpisodeQuizQueryDto, {
        playbackMs: -10,
        profileMode: 'invalid_mode',
        limit: 50,
      });
      const invalidErrs = await validate(invalid);
      assert.ok(invalidErrs.length >= 2);
    });

    it('returns post-watch quiz items unlocked up to playback position', async () => {
      const res = createMockResponse();
      const quizzes = await contextController.getEpisodePostWatchQuiz(
        episodeIdTOS,
        {
          playbackMs: 600000,
          profileMode: 'quick_glance',
          limit: 5,
        },
        res,
      );

      assert.equal(res.getHeader('cache-control'), 'private, no-cache, no-transform');
      assert.ok(Array.isArray(quizzes));
      for (const q of quizzes) {
        assert.ok(q.unlock_time_ms <= 600000);
        assert.ok(Array.isArray(q.options));
        assert.ok(q.options.length >= 2);
        assert.ok(typeof q.correctIndex === 'number');
      }
    });
  });

  // --------------------------------------------------------------------------
  // 5. Runtime Anti-Spoiler Firewall Interceptor
  // --------------------------------------------------------------------------
  describe('Runtime Anti-Spoiler Firewall (SpoilerFirewallInterceptor)', () => {
    it('clamps spoilerSafeUpToMs when it exceeds playbackPositionMs (Invariant 3)', () => {
      const leakyCard = {
        headline: 'Thom meets Celia',
        spoilerSafeUpToMs: 250000, // Anomaly: beyond playback position
        suggestedActions: ['Action 1', 'Action 2'],
      };

      const clamped = enforceSpoilerFirewall(leakyCard, 150000);
      assert.equal(clamped.spoilerSafeUpToMs, 150000);
    });

    it('guarantees 2–4 D-pad quick action chips on response cards (Invariant 4)', () => {
      // 0 action chips -> populated with default 3 chips
      const noChips = {
        headline: 'Scene Summary',
        spoilerSafeUpToMs: 100000,
        suggestedActions: [],
      };
      const fixedNoChips = enforceSpoilerFirewall(noChips, 100000);
      assert.ok(fixedNoChips.suggestedActions.length >= 2 && fixedNoChips.suggestedActions.length <= 4);
      assert.deepEqual(fixedNoChips.suggestedActions, DEFAULT_FIREWALL_QUICK_ACTIONS);

      // 6 action chips -> trimmed to max 4 chips
      const tooManyChips = {
        headline: 'Scene Summary',
        spoilerSafeUpToMs: 100000,
        suggestedActions: ['A', 'B', 'C', 'D', 'E', 'F'],
      };
      const fixedTooMany = enforceSpoilerFirewall(tooManyChips, 100000);
      assert.equal(fixedTooMany.suggestedActions.length, 4);
      assert.deepEqual(fixedTooMany.suggestedActions, ['A', 'B', 'C', 'D']);
    });

    it('interceptor executes seamlessly in NestJS pipeline', async () => {
      const interceptor = new SpoilerFirewallInterceptor();
      const mockExecutionContext: any = {
        switchToHttp: () => ({
          getRequest: () => ({
            body: { playbackPositionMs: 120000 },
          }),
        }),
      };
      const mockCallHandler: any = {
        handle: () =>
          of({
            headline: 'Test Scene',
            spoilerSafeUpToMs: 180000,
            suggestedActions: ['Single chip'],
          }),
      };

      const result = await new Promise((resolve) => {
        interceptor.intercept(mockExecutionContext, mockCallHandler).subscribe(resolve);
      });

      assert.equal((result as any).spoilerSafeUpToMs, 120000);
      assert.equal((result as any).suggestedActions.length, 3);
    });
  });

  // --------------------------------------------------------------------------
  // 6. Interaction Telemetry Recording & Helpfulness Voting
  // --------------------------------------------------------------------------
  describe('Interaction Telemetry & Helpfulness Voting (AiGatewayService)', () => {
    it('records interaction telemetry and attaches interactionId on query execution', async () => {
      const aiGateway = new AiGatewayService(mockConfig, contextService, unconfiguredSupabase);
      (aiGateway as any).engine = {
        execute: async () => ({
          headline: 'Thom is a holographic engineer',
          body: 'Thom is reconstructing past memories with Celia inside the Oude Kerk.',
          spoilerSafeUpToMs: 60000,
          confidenceScore: 0.95,
          actionType: WispActionType.CONTEXTUAL_QA,
          profileMode: HouseholdProfileMode.QUICK_GLANCE,
          episodeId: episodeIdTOS,
          providerUsed: 'groq',
          suggestedActions: ['Explain what just happened', 'Who is Celia?'],
        }),
      };
      const queryDto = plainToInstance(WispQueryRequestDto, {
        episodeId: episodeIdTOS,
        playbackPositionMs: 60000,
        actionType: WispActionType.CONTEXTUAL_QA,
        prompt: 'Who is Thom?',
      });

      const response = await aiGateway.processWispQuery(queryDto, 'device-tester-01');
      assert.ok(response);
      assert.ok(response.interactionId, 'Expected interactionId to be generated and attached');

      // Helpfulness voting using the returned interactionId
      const voteRes = await aiGateway.voteInteraction(
        response.interactionId!,
        1,
        'device-tester-01',
      );
      assert.equal(voteRes.success, true);
      assert.equal(voteRes.vote, 1);
    });
  });

  // --------------------------------------------------------------------------
  // 7. Production Observability & Maintenance Endpoints
  // --------------------------------------------------------------------------
  describe('Observability & Maintenance (/api/v1/observability/*)', () => {
    const observabilityService = new ObservabilityService(unconfiguredSupabase, catalogService);
    const observabilityController = new ObservabilityController(observabilityService, mockConfig);

    it('GET /summary returns structured health, catalog, provider, and spoiler audit telemetry', async () => {
      const res = createMockResponse();
      const summary = await observabilityController.getSummaryMetrics(res);

      assert.equal(res.getHeader('cache-control'), 'private, no-cache, no-transform');
      assert.equal(summary.status, 'healthy');
      assert.ok(summary.catalog.programs_count >= 3);
      assert.ok(summary.catalog.episodes_count >= 3);
      assert.ok(summary.cache_efficiency.cumulative_cache_hits >= 0);
      assert.ok(Array.isArray(summary.ai_providers));
      assert.ok(Array.isArray(summary.latency_percentiles));
      assert.ok(summary.spoiler_safety_audit.total_audit_events >= 0);
    });

    it('GET /coverage returns temporal coverage breakdown across episodes', async () => {
      const res = createMockResponse();
      const coverage = await observabilityController.getTemporalCoverage(res);

      assert.equal(res.getHeader('cache-control'), 'private, no-cache, no-transform');
      assert.ok(Array.isArray(coverage));
      assert.ok(coverage.length >= 3);

      const tos = coverage.find((c: any) => c.program_slug === 'tears-of-steel');
      assert.ok(tos);
      assert.equal(tos.timeline_coverage_pct, 100.0);
      assert.ok(tos.scene_count > 0);
    });

    it('GET /providers returns AI provider throughput and P50/P95/P99 latency percentiles', async () => {
      const res = createMockResponse();
      const providers = await observabilityController.getProviderPerformance(res);

      assert.equal(res.getHeader('cache-control'), 'private, no-cache, no-transform');
      assert.ok(Array.isArray(providers.performance));
      assert.ok(Array.isArray(providers.latencyPercentiles));

      for (const p of providers.latencyPercentiles) {
        assert.ok(typeof p.p50_latency_ms === 'number');
        assert.ok(typeof p.p95_latency_ms === 'number');
        assert.ok(typeof p.p99_latency_ms === 'number');
        assert.ok(p.p99_latency_ms >= p.p50_latency_ms);
      }
    });

    it('GET /hotspots returns scene engagement rankings', async () => {
      const res = createMockResponse();
      const hotspots = await observabilityController.getEngagementHotspots(res);

      assert.equal(res.getHeader('cache-control'), 'private, no-cache, no-transform');
      assert.ok(Array.isArray(hotspots));
      assert.ok(hotspots.length > 0);
      assert.ok(hotspots[0].total_viewer_queries >= 0);
    });

    it('POST /purge enforces operator credentials when configured', async () => {
      const res = createMockResponse();

      // Missing operator token -> 401 Unauthorized
      await assert.rejects(
        async () => observabilityController.purgeMaintenance(res),
        UnauthorizedException,
      );

      // Invalid operator token -> 401 Unauthorized
      await assert.rejects(
        async () =>
          observabilityController.purgeMaintenance(res, 'wrong-token'),
        UnauthorizedException,
      );

      // Valid operator token -> 200 OK with purge statistics
      const purgeResult = await observabilityController.purgeMaintenance(
        res,
        'op-secret-key-1234',
      );
      assert.ok(typeof purgeResult.purged_cache_entries === 'number');
      assert.ok(typeof purgeResult.purged_conversation_sessions === 'number');
      assert.ok(typeof purgeResult.purged_rate_limit_windows === 'number');
      assert.ok(purgeResult.executed_at);
    });
  });
});
