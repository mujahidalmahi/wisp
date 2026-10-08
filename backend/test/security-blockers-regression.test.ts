import 'reflect-metadata';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'crypto';
import { ConfigService } from '@nestjs/config';
import {
  ForbiddenException,
  HttpException,
  HttpStatus,
  UnauthorizedException,
} from '@nestjs/common';

import { CsrfService } from '../dist/common/security/csrf.service.js';
import { CsrfAndOriginGuard } from '../dist/common/security/csrf-and-origin.guard.js';
import { DatabaseRateLimitGuard } from '../dist/common/security/database-rate-limit.guard.js';
import { DeviceTokenService } from '../dist/common/auth/device-token.service.js';
import { DeviceAuthGuard } from '../dist/common/guards/device-auth.guard.js';
import { sanitizePayloadRecursively } from '../dist/common/security/input-sanitizer.js';
import { SupabaseService } from '../dist/modules/supabase/supabase.service.js';
import { CatalogService } from '../dist/modules/catalog/catalog.service.js';
import { SessionsService } from '../dist/modules/sessions/sessions.service.js';
import { AiGatewayService } from '../dist/modules/ai-gateway/ai-gateway.service.js';
import { AiGatewayController } from '../dist/modules/ai-gateway/ai-gateway.controller.js';
import { ContextService } from '../dist/modules/context/context.service.js';
import {
  HouseholdProfileMode,
  WispActionType,
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
  service.isConfigured = () => true;
  service.getClient = () => (service as any).client;
  service.executeRpc = SupabaseService.prototype.executeRpc.bind(service);
  service.executeWithRetry = SupabaseService.prototype.executeWithRetry.bind(service);
  service.recordOperation = () => {};
  return service as SupabaseService;
}

const createMockContext = (req: any, res?: any) =>
  ({
    switchToHttp: () => ({
      getRequest: () => req,
      getResponse: () => res || { setHeader: () => {} },
    }),
  }) as any;

const createMockContextService = () =>
  ({
    getHybridContextSource: () => ({
      getContext: async () => ({}),
    }),
  }) as unknown as ContextService;

const createMockCatalogService = () =>
  ({
    getEpisodeById: async (id: string) => ({
      id,
      title: 'Test Episode',
      programTitle: 'Test Show',
    }),
  }) as unknown as CatalogService;

describe('PR Review Security Blockers Regression Suite', () => {
  // =========================================================================
  // Blocker 1: Database rate limiting fails closed in production
  // =========================================================================
  describe('Blocker 1: Database rate limit fail-closed in production', () => {
    it('fails closed with 503 Service Unavailable when RPC returns an error in production', async () => {
      const origEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';
      try {
        const mockSupabase = createMockSupabase({
          rpc: async () => ({
            data: null,
            error: { message: 'connection failure to pgbouncer' },
          }),
        });
        const guard = new DatabaseRateLimitGuard(mockSupabase);
        const req = { url: '/api/v1/context/query', method: 'POST', ip: '10.0.0.1', headers: {} };

        await assert.rejects(
          async () => guard.canActivate(createMockContext(req)),
          (err: any) =>
            err instanceof HttpException &&
            err.getStatus() === HttpStatus.SERVICE_UNAVAILABLE &&
            err.getResponse()?.headline === 'Service Temporarily Unavailable',
        );
      } finally {
        process.env.NODE_ENV = origEnv;
      }
    });

    it('fails closed with 503 when RPC returns null data in production', async () => {
      const origEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';
      try {
        const mockSupabase = createMockSupabase({
          rpc: async () => ({ data: null, error: null }),
        });
        const guard = new DatabaseRateLimitGuard(mockSupabase);
        const req = { url: '/api/v1/context/query', method: 'POST', ip: '10.0.0.1', headers: {} };

        await assert.rejects(
          async () => guard.canActivate(createMockContext(req)),
          (err: any) =>
            err instanceof HttpException &&
            err.getStatus() === HttpStatus.SERVICE_UNAVAILABLE,
        );
      } finally {
        process.env.NODE_ENV = origEnv;
      }
    });

    it('fails closed with 503 when window_reset_at is malformed in production', async () => {
      const origEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';
      try {
        const mockSupabase = createMockSupabase({
          rpc: async () => ({
            data: {
              allowed: true,
              device_id: 'ip:10.0.0.1',
              current_count: 5,
              max_requests: 30,
              remaining: 25,
              window_reset_at: 'NOT-A-VALID-DATE',
            },
            error: null,
          }),
        });
        const guard = new DatabaseRateLimitGuard(mockSupabase);
        const req = { url: '/api/v1/context/query', method: 'POST', ip: '10.0.0.1', headers: {} };

        await assert.rejects(
          async () => guard.canActivate(createMockContext(req)),
          (err: any) =>
            err instanceof HttpException &&
            err.getStatus() === HttpStatus.SERVICE_UNAVAILABLE,
        );
      } finally {
        process.env.NODE_ENV = origEnv;
      }
    });
  });

  // =========================================================================
  // Blocker 2: Anti-spoofing in global rate limit guard
  // =========================================================================
  describe('Blocker 2: Rate limit identity derivation & spoofing prevention', () => {
    it('rates unauthenticated requests strictly by client IP, ignoring spoofed headers', async () => {
      const checkedDeviceIds: string[] = [];
      const mockSupabase = createMockSupabase({
        rpc: async (name, params) => {
          checkedDeviceIds.push(params.p_device_id);
          return {
            data: {
              allowed: true,
              device_id: params.p_device_id,
              current_count: 1,
              max_requests: 30,
              remaining: 29,
              window_reset_at: new Date(Date.now() + 60000).toISOString(),
            },
            error: null,
          };
        },
      });

      const guard = new DatabaseRateLimitGuard(mockSupabase);

      // Caller sends spoofed headers and body deviceId
      const req = {
        url: '/api/v1/sessions',
        method: 'POST',
        ip: '198.51.100.77',
        headers: {
          'x-firetv-device-id': 'spoofed-firetv-alpha',
          'x-device-id': 'spoofed-device-beta',
        },
        body: {
          deviceId: 'spoofed-body-gamma',
        },
      };

      await guard.canActivate(createMockContext(req));

      // Must be evaluated against IP bucket, NEVER against client-supplied IDs
      assert.equal(checkedDeviceIds.length, 1);
      assert.equal(checkedDeviceIds[0], 'ip:198.51.100.77');
    });

    it('uses verified token device identity when a valid JWT is presented', async () => {
      const deviceTokenService = new DeviceTokenService();
      const validToken = deviceTokenService.signDeviceToken('authenticated-firetv-device-99');
      let rateLimitedIdentity = '';

      const mockSupabase = createMockSupabase({
        rpc: async (name, params) => {
          rateLimitedIdentity = params.p_device_id;
          return {
            data: {
              allowed: true,
              device_id: params.p_device_id,
              current_count: 1,
              max_requests: 30,
              remaining: 29,
              window_reset_at: new Date(Date.now() + 60000).toISOString(),
            },
            error: null,
          };
        },
      });

      const guard = new DatabaseRateLimitGuard(mockSupabase, deviceTokenService);
      const req = {
        url: '/api/v1/sessions',
        method: 'POST',
        ip: '198.51.100.77',
        headers: {
          authorization: `Bearer ${validToken}`,
          'x-firetv-device-id': 'spoofed-to-be-ignored-id',
        },
      };

      await guard.canActivate(createMockContext(req));
      assert.equal(rateLimitedIdentity, 'authenticated-firetv-device-99');
    });
  });

  // =========================================================================
  // Blocker 3: Bookmark profile ownership validation
  // =========================================================================
  describe('Blocker 3: Bookmark profile ownership validation', () => {
    it('rejects bookmark creation with 403 Forbidden when profile belongs to another device', async () => {
      const mockSupabase = createMockSupabase({
        from: (table: string) => {
          if (table === 'profiles') {
            return {
              select: () => ({
                eq: (col: string, val: string) => ({
                  maybeSingle: async () => ({
                    // Profile belongs to another device!
                    data: { id: val, device_id: 'other-device' },
                    error: null,
                  }),
                }),
              }),
            };
          }
          return {};
        },
      });

      const catalog = createMockCatalogService();
      const sessions = new SessionsService(mockSupabase, catalog);

      await assert.rejects(
        async () =>
          sessions.createBookmark(
            'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1',
            'device-attacker',
            {
              profileId: '11111111-1111-1111-1111-111111111111',
              playbackPositionMs: 12000,
              label: 'Stolen bookmark',
            },
          ),
        (err: any) =>
          err instanceof ForbiddenException &&
          err.message.includes('does not belong to authenticated device'),
      );
    });

    it('succeeds when profile is verified to belong to authenticated device', async () => {
      const mockSupabase = createMockSupabase({
        from: (table: string) => {
          if (table === 'profiles') {
            return {
              select: () => ({
                eq: (col: string, val: string) => ({
                  maybeSingle: async () => ({
                    data: { id: val, device_id: 'device-owner' },
                    error: null,
                  }),
                }),
              }),
            };
          }
          if (table === 'conversation_sessions') {
            return {
              select: () => ({
                eq: () => ({
                  eq: () => ({
                    gt: () => ({
                      order: () => ({
                        limit: () => ({
                          maybeSingle: async () => ({ data: null, error: null }),
                        }),
                      }),
                    }),
                    maybeSingle: async () => ({ data: null, error: null }),
                  }),
                }),
              }),
              insert: () => ({
                select: () => ({
                  single: async () => ({
                    data: {
                      id: 'new-session-id',
                      device_id: 'device-owner',
                      episode_id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1',
                      bookmarked_moments: [],
                    },
                    error: null,
                  }),
                }),
              }),
            };
          }
          return {};
        },
      });

      const catalog = createMockCatalogService();
      const sessions = new SessionsService(mockSupabase, catalog);

      const res = await sessions.createBookmark(
        'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1',
        'device-owner',
        {
          profileId: '11111111-1111-1111-1111-111111111111',
          playbackPositionMs: 15000,
          label: 'Valid bookmark',
        },
      );

      assert.ok(res.success);
      assert.equal(res.bookmark.label, 'Valid bookmark');
      assert.equal(res.bookmark.playbackPositionMs, 15000);
    });
  });

  // =========================================================================
  // Blocker 4: Scoped existing-session bookmark updates
  // =========================================================================
  describe('Blocker 4: Scoped existing-session bookmark updates', () => {
    it('scopes update queries by both session id AND device_id', async () => {
      const eqCalls: Record<string, string> = {};
      const mockSupabase = createMockSupabase({
        from: (table: string) => {
          if (table === 'profiles') {
            return {
              select: () => ({
                eq: () => ({
                  maybeSingle: async () => ({
                    data: { id: 'prof-1', device_id: 'device-owner' },
                    error: null,
                  }),
                }),
              }),
            };
          }
          if (table === 'conversation_sessions') {
            return {
              select: () => ({
                eq: () => ({
                  eq: () => ({
                    gt: () => ({
                      order: () => ({
                        limit: () => ({
                          maybeSingle: async () => ({
                            data: {
                              id: 'session-target-id',
                              device_id: 'device-owner',
                              episode_id: 'ep-1',
                              bookmarked_moments: [],
                            },
                            error: null,
                          }),
                        }),
                      }),
                    }),
                  }),
                }),
              }),
              update: () => {
                const chain: any = {
                  eq: (col: string, val: string) => {
                    eqCalls[col] = val;
                    return chain;
                  },
                  gt: (col: string, val: string) => {
                    return chain;
                  },
                  select: () => ({
                    maybeSingle: async () => ({
                      data: {
                        id: 'session-target-id',
                        device_id: 'device-owner',
                        bookmarked_moments: [],
                      },
                      error: null,
                    }),
                  }),
                };
                return chain;
              },
            };
          }
          return {};
        },
      });

      const catalog = createMockCatalogService();
      const sessions = new SessionsService(mockSupabase, catalog);

      await sessions.createBookmark(
        'ep-1',
        'device-owner',
        {
          profileId: 'prof-1',
          playbackPositionMs: 20000,
          label: 'Scoped update test',
        },
      );

      assert.equal(eqCalls['id'], 'session-target-id');
      assert.equal(eqCalls['device_id'], 'device-owner');
    });
  });

  // =========================================================================
  // Blocker 5: Bookmark concurrency, idempotency, and array cap
  // =========================================================================
  describe('Blocker 5: Bookmark concurrency, idempotency, and array cap', () => {
    it('deduplicates retries with matching interactionId', async () => {
      const catalog = createMockCatalogService();
      // In-memory fallback mode (unconfigured Supabase)
      const unconfiguredSupabase = new SupabaseService(new ConfigService({}));
      const sessions = new SessionsService(unconfiguredSupabase, catalog);

      const res1 = await sessions.createBookmark(
        'ep-1',
        'dev-test',
        {
          interactionId: 'interaction-dup-1',
          playbackPositionMs: 10000,
          label: 'First Attempt',
        },
      );

      const res2 = await sessions.createBookmark(
        'ep-1',
        'dev-test',
        {
          interactionId: 'interaction-dup-1',
          playbackPositionMs: 10000,
          label: 'Retry Attempt',
        },
      );

      assert.equal(res1.bookmark.id, res2.bookmark.id);

      const session = await sessions.getSession('ep-1', 'dev-test');
      const matching = session.bookmarkedMoments.filter(b => b.interactionId === 'interaction-dup-1');
      assert.equal(matching.length, 1);
    });

    it('caps session bookmarks array to 100 entries', async () => {
      const catalog = createMockCatalogService();
      // In-memory fallback mode (unconfigured Supabase)
      const unconfiguredSupabase = new SupabaseService(new ConfigService({}));
      const sessions = new SessionsService(unconfiguredSupabase, catalog);

      // Insert 105 distinct bookmarks
      for (let i = 0; i < 105; i++) {
        await sessions.createBookmark(
          'ep-1',
          'dev-test-cap',
          {
            playbackPositionMs: i * 1000,
            label: `Bookmark #${i}`,
          },
        );
      }

      const session = await sessions.getSession('ep-1', 'dev-test-cap');
      assert.equal(session.bookmarkedMoments.length, 100);
      // Ensures newest bookmark is retained
      assert.equal(session.bookmarkedMoments[session.bookmarkedMoments.length - 1].label, 'Bookmark #104');
    });
  });

  // =========================================================================
  // Blocker 6: Fail-closed voting for profile-less interactions
  // =========================================================================
  describe('Blocker 6: Fail-closed voting for profile-less or unowned interactions', () => {
    it('fails closed with 403 Forbidden when interaction has no profile_id', async () => {
      const config = new ConfigService({});
      const mockSupabase = createMockSupabase({
        from: (table: string) => {
          if (table === 'interaction_history') {
            return {
              select: () => ({
                eq: () => ({
                  maybeSingle: async () => ({
                    data: {
                      id: 'interaction-null-profile',
                      profile_id: null, // No profile association!
                    },
                    error: null,
                  }),
                }),
              }),
            };
          }
          return {};
        },
      });

      const contextService = createMockContextService();
      const aiGateway = new AiGatewayService(config, contextService, mockSupabase);

      await assert.rejects(
        async () =>
          aiGateway.voteInteraction(
            'interaction-null-profile',
            1,
            'device-voter',
          ),
        (err: any) =>
          err instanceof ForbiddenException &&
          err.message.includes('Interaction has no associated profile'),
      );
    });

    it('scopes vote update query by profile_id and interaction ID', async () => {
      const config = new ConfigService({});
      const eqFilters: Record<string, string> = {};

      const mockSupabase = createMockSupabase({
        from: (table: string) => {
          if (table === 'interaction_history') {
            return {
              select: () => ({
                eq: () => ({
                  maybeSingle: async () => ({
                    data: {
                      id: 'interaction-ok',
                      profile_id: 'prof-owned-1',
                    },
                    error: null,
                  }),
                }),
              }),
              update: () => ({
                eq: (col1: string, val1: string) => {
                  eqFilters[col1] = val1;
                  return {
                    eq: (col2: string, val2: string) => {
                      eqFilters[col2] = val2;
                      return Promise.resolve({ data: null, error: null });
                    },
                  };
                },
              }),
            };
          }
          if (table === 'profiles') {
            return {
              select: () => ({
                eq: () => ({
                  maybeSingle: async () => ({
                    data: {
                      id: 'prof-owned-1',
                      device_id: 'device-voter',
                    },
                    error: null,
                  }),
                }),
              }),
            };
          }
          return {};
        },
      });

      const contextService = createMockContextService();
      const aiGateway = new AiGatewayService(config, contextService, mockSupabase);

      await aiGateway.voteInteraction('interaction-ok', 1, 'device-voter');

      assert.equal(eqFilters['id'], 'interaction-ok');
      assert.equal(eqFilters['profile_id'], 'prof-owned-1');
    });
  });

  // =========================================================================
  // Blocker 7: Prompt-sensitive AI cache keys
  // =========================================================================
  describe('Blocker 7: Prompt-sensitive AI cache keys', () => {
    it('incorporates prompt hash and isolates distinct questions at identical playhead', () => {
      const config = new ConfigService({});
      const aiGateway = new AiGatewayService(config, createMockContextService(), createMockSupabase({}));

      const keyA = aiGateway.computeCacheKey(
        'ep-1',
        WispActionType.CONTEXTUAL_QA,
        HouseholdProfileMode.QUICK_GLANCE,
        30,
        'Who is talking?',
      );

      const keyB = aiGateway.computeCacheKey(
        'ep-1',
        WispActionType.CONTEXTUAL_QA,
        HouseholdProfileMode.QUICK_GLANCE,
        30,
        'Why did she leave the room?',
      );

      assert.notEqual(keyA, keyB);
      assert.ok(keyA.startsWith('ep-1:contextual_qa:quick_glance:30:'));
      assert.ok(keyB.startsWith('ep-1:contextual_qa:quick_glance:30:'));
    });
  });

  // =========================================================================
  // Blocker 8 & 9: Cached card validation and read-time spoiler boundary
  // =========================================================================
  describe('Blocker 8 & 9: Cached card validation and read-time spoiler boundary', () => {
    it('rejects cached card where spoilerSafeUpToMs exceeds current playback position', async () => {
      const config = new ConfigService({});
      let engineCalled = false;

      const mockSupabase = createMockSupabase({
        rpc: async (name) => {
          if (name === 'get_or_touch_ai_cache') {
            return {
              data: {
                headline: 'Cached Plot Reveal',
                body: 'Reveals plot from 60 seconds into episode',
                spoilerSafeUpToMs: 60000, // 60s
                profileMode: 'quick_glance',
                providerUsed: 'groq',
                followUpChips: [],
              },
              error: null,
            };
          }
          return { data: null, error: null };
        },
      });

      const aiGateway = new AiGatewayService(config, createMockContextService(), mockSupabase);
      (aiGateway as any).engine.execute = async () => {
        engineCalled = true;
        return {
          headline: 'Safe Context',
          body: 'Fresh generated context',
          spoilerSafeUpToMs: 20000,
          profileMode: 'quick_glance',
          providerUsed: 'groq',
          followUpChips: [],
        };
      };

      // Current playhead is only 20 seconds, cache has 60 seconds (SPOILER)
      const res = await aiGateway.processWispQuery({
        episodeId: 'ep-1',
        playbackPositionMs: 20000,
        actionType: WispActionType.CONTEXTUAL_QA,
        prompt: 'Who is that?',
        profileMode: HouseholdProfileMode.QUICK_GLANCE,
      });

      assert.equal(engineCalled, true);
      assert.equal(res.cached, false);
      assert.equal(res.headline, 'Safe Context');
    });

    it('rejects cached card missing mandatory headline or body fields', async () => {
      const config = new ConfigService({});
      let engineCalled = false;

      const mockSupabase = createMockSupabase({
        rpc: async (name) => {
          if (name === 'get_or_touch_ai_cache') {
            return {
              data: {
                // Missing headline and body!
                spoilerSafeUpToMs: 15000,
                profileMode: 'quick_glance',
              },
              error: null,
            };
          }
          return { data: null, error: null };
        },
      });

      const aiGateway = new AiGatewayService(config, createMockContextService(), mockSupabase);
      (aiGateway as any).engine.execute = async () => {
        engineCalled = true;
        return {
          headline: 'Repaired Context',
          body: 'Repaired body text',
          spoilerSafeUpToMs: 15000,
          profileMode: 'quick_glance',
          providerUsed: 'groq',
          followUpChips: [],
        };
      };

      const res = await aiGateway.processWispQuery({
        episodeId: 'ep-1',
        playbackPositionMs: 15000,
        actionType: WispActionType.CONTEXTUAL_QA,
        prompt: 'Tell me more',
        profileMode: HouseholdProfileMode.QUICK_GLANCE,
      });

      assert.equal(engineCalled, true);
      assert.equal(res.cached, false);
      assert.equal(res.headline, 'Repaired Context');
    });
  });

  // =========================================================================
  // Blocker 10: Strict CSRF guard exemptions & operator token verification
  // =========================================================================
  describe('Blocker 10: Strict CSRF guard exemptions & operator verification', () => {
    const csrfService = new CsrfService();
    const deviceTokenService = new DeviceTokenService();
    const guard = new CsrfAndOriginGuard(csrfService, deviceTokenService);

    it('rejects arbitrary paths containing /auth/ without valid credentials', () => {
      const req = {
        method: 'POST',
        path: '/api/v1/auth/arbitrary-endpoint',
        headers: {},
      };
      assert.throws(
        () => guard.canActivate(createMockContext(req)),
        (err: any) => err instanceof UnauthorizedException,
      );
    });

    it('rejects requests with invalid or forged x-operator-token with 401 Unauthorized', () => {
      const orig = process.env.INTERNAL_OPERATOR_TOKEN;
      process.env.INTERNAL_OPERATOR_TOKEN = 'real-secret-key-123';
      try {
        const req = {
          method: 'POST',
          path: '/api/v1/catalog/refresh',
          headers: {
            'x-operator-token': 'attacker-forged-token',
          },
        };
        assert.throws(
          () => guard.canActivate(createMockContext(req)),
          (err: any) =>
            err instanceof UnauthorizedException &&
            err.message.includes('Invalid operator credentials'),
        );
      } finally {
        process.env.INTERNAL_OPERATOR_TOKEN = orig;
      }
    });

    it('permits requests with verified x-operator-token', () => {
      const orig = process.env.INTERNAL_OPERATOR_TOKEN;
      process.env.INTERNAL_OPERATOR_TOKEN = 'real-secret-key-123';
      try {
        const req = {
          method: 'POST',
          path: '/api/v1/catalog/refresh',
          headers: {
            'x-operator-token': 'real-secret-key-123',
          },
        };
        assert.equal(guard.canActivate(createMockContext(req)), true);
      } finally {
        process.env.INTERNAL_OPERATOR_TOKEN = orig;
      }
    });

    it('permits exact public enrollment bootstrap routes', () => {
      const reqEnroll = { method: 'POST', path: '/api/v1/auth/enroll', headers: {} };
      assert.equal(guard.canActivate(createMockContext(reqEnroll)), true);

      const reqToken = { method: 'POST', path: '/api/v1/auth/device-token', headers: {} };
      assert.equal(guard.canActivate(createMockContext(reqToken)), true);
    });
  });

  // =========================================================================
  // Blocker 11: CSRF token client identity binding
  // =========================================================================
  describe('Blocker 11: CSRF token client identity binding', () => {
    const csrfService = new CsrfService();

    it('binds CSRF token to client identifier and rejects replay from different client IP', () => {
      const token = csrfService.generateToken('198.51.100.10').csrfToken;

      // Matching client IP succeeds
      assert.equal(csrfService.verifyToken(token, '198.51.100.10'), true);

      // Replay by different client IP fails
      assert.equal(csrfService.verifyToken(token, '203.0.113.50'), false);
    });

    it('rejects tampered clientHash in 4-part CSRF token', () => {
      const token = csrfService.generateToken('198.51.100.10').csrfToken;
      const parts = token.split('.');
      assert.equal(parts.length, 4);

      // Tamper with clientHash
      const forgedToken = `${parts[0]}.${parts[1]}.0000000000000000.${parts[3]}`;
      assert.equal(csrfService.verifyToken(forgedToken, '198.51.100.10'), false);
    });
  });

  // =========================================================================
  // Blocker 12: DeviceAuthGuard on POST /wisp/query
  // =========================================================================
  describe('Blocker 12: DeviceAuthGuard and Profile Ownership on POST /wisp/query', () => {
    it('attaches DeviceAuthGuard to POST /wisp/query route handler', () => {
      const guards = Reflect.getMetadata('__guards__', AiGatewayController.prototype.queryWisp);
      assert.ok(Array.isArray(guards), 'queryWisp must have guards metadata array');
      assert.ok(
        guards.includes(DeviceAuthGuard),
        'queryWisp must be guarded by DeviceAuthGuard',
      );
    });

    it('rejects unauthenticated requests with UnauthorizedException', () => {
      const guard = new DeviceAuthGuard();
      const unauthReq = { headers: {} };
      assert.throws(
        () => guard.canActivate(createMockContext(unauthReq)),
        (err: any) => err instanceof UnauthorizedException,
      );
    });

    it('rejects cross-device profile access in processWispQuery with 403 Forbidden', async () => {
      const mockSupabase = createMockSupabase({
        from: (table) => {
          if (table === 'profiles') {
            return {
              select: () => ({
                eq: (col: string, val: string) => ({
                  maybeSingle: async () => ({
                    data: { id: val, device_id: 'legitimate-device-A' },
                    error: null,
                  }),
                }),
              }),
            };
          }
          return { select: () => ({}) };
        },
      });

      const aiGateway = new AiGatewayService(
        new ConfigService(),
        createMockContextService(),
        mockSupabase,
      );

      await assert.rejects(
        async () =>
          aiGateway.processWispQuery(
            {
              episodeId: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1',
              playbackPositionMs: 5000,
              actionType: WispActionType.CONTEXTUAL_QA,
              prompt: 'test question',
              profileId: 'target-profile-1',
            },
            'attacker-device-B',
          ),
        (err: any) =>
          err instanceof ForbiddenException &&
          err.message.includes('Profile \'target-profile-1\' does not belong to authenticated device'),
      );
    });
  });

  // =========================================================================
  // Blocker 13: Expired session bookmarking creates fresh session
  // =========================================================================
  describe('Blocker 13: Expired session bookmarking creates fresh session', () => {
    it('creates a fresh session row instead of reviving an expired session', async () => {
      let insertCalled = false;
      let insertedPayload: any = null;
      let updateCalled = false;

      const mockSupabase = createMockSupabase({
        from: (table) => {
          if (table === 'conversation_sessions') {
            return {
              select: () => ({
                eq: () => ({
                  eq: () => ({
                    gt: () => ({
                      order: () => ({
                        limit: () => ({
                          maybeSingle: async () => {
                            // Active session lookup returns null because existing row is expired
                            return { data: null, error: null };
                          },
                        }),
                      }),
                    }),
                  }),
                }),
              }),
              update: () => {
                updateCalled = true;
                return {
                  eq: () => ({
                    eq: () => ({
                      eq: () => ({
                        gt: () => ({
                          select: () => ({
                            maybeSingle: async () => ({ data: null, error: null }),
                          }),
                        }),
                      }),
                    }),
                  }),
                };
              },
              insert: (payload: any) => {
                insertCalled = true;
                insertedPayload = payload;
                return {
                  select: () => ({
                    single: async () => ({
                      data: { id: 'brand-new-session-id', ...payload },
                      error: null,
                    }),
                  }),
                };
              },
            };
          }
          return { select: () => ({}) };
        },
      });

      const sessionsService = new SessionsService(
        mockSupabase,
        createMockCatalogService(),
      );

      const result = await sessionsService.createBookmark('ep-test-1', 'device-test-1', {
        playbackPositionMs: 12000,
        label: 'A Moment in Time',
      });

      assert.equal(updateCalled, false, 'Must not update expired session');
      assert.equal(insertCalled, true, 'Must insert fresh session');
      assert.equal(result.sessionId, 'brand-new-session-id');
      assert.equal(insertedPayload.device_id, 'device-test-1');
      assert.equal(insertedPayload.episode_id, 'ep-test-1');
    });
  });

  // =========================================================================
  // Blocker 14: Prototype pollution defense in input sanitizer
  // =========================================================================
  describe('Blocker 14: Prototype pollution defense in input sanitizer', () => {
    it('strips __proto__, constructor, and prototype keys without polluting Object prototype', () => {
      const maliciousJson =
        '{"__proto__":{"polluted":"yes"},"constructor":{"polluted":"yes"},"prototype":{"polluted":"yes"},"cleanKey":"safe <|endoftext|> text"}';
      const parsed = JSON.parse(maliciousJson);

      const sanitized: any = sanitizePayloadRecursively(parsed);

      // Verify Object prototype is completely untouched
      assert.equal((Object.prototype as any).polluted, undefined);
      assert.equal(({} as any).polluted, undefined);

      // Verify dangerous keys are stripped from output object
      assert.equal(sanitized.polluted, undefined);
      assert.equal(sanitized.cleanKey, 'safe  text');
    });
  });
});
