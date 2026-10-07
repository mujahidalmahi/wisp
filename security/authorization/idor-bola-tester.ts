import assert from 'node:assert/strict';
import { ProfilesService } from '../../backend/dist/modules/profiles/profiles.service.js';
import { SessionsService } from '../../backend/dist/modules/sessions/sessions.service.js';
import { AiGatewayService } from '../../backend/dist/modules/ai-gateway/ai-gateway.service.js';
import { AuthController } from '../../backend/dist/modules/auth/auth.controller.js';
import { DeviceTokenService } from '../../backend/dist/common/auth/device-token.service.js';
import { SupabaseService } from '../../backend/dist/modules/supabase/supabase.service.js';
import { CatalogService } from '../../backend/dist/modules/catalog/catalog.service.js';
import { ContextService } from '../../backend/dist/modules/context/context.service.js';
import { ConfigService } from '@nestjs/config';
import { ForbiddenException, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { SecurityStatus } from '../config/security.config.ts';

export interface AuthorizationTestResult {
  suite: string;
  status: SecurityStatus;
  testsRun: number;
  testsPassed: number;
  testsFailed: number;
  results: Array<{ testName: string; passed: boolean; details?: string }>;
  durationMs: number;
}

export async function runAuthorizationTests(): Promise<AuthorizationTestResult> {
  const start = Date.now();
  const results: AuthorizationTestResult['results'] = [];
  let testsRun = 0;
  let testsPassed = 0;
  let testsFailed = 0;

  async function record(testName: string, fn: () => Promise<void>) {
    testsRun++;
    try {
      await fn();
      testsPassed++;
      results.push({ testName, passed: true });
    } catch (err: any) {
      testsFailed++;
      results.push({ testName, passed: false, details: err?.message });
    }
  }

  const config = new ConfigService({});
  const supabase = new SupabaseService(config);
  const catalog = new CatalogService(supabase);
  const profilesService = new ProfilesService(supabase);
  const sessionsService = new SessionsService(supabase, catalog);
  const contextService = new ContextService(supabase, catalog, profilesService);
  const aiGatewayService = new AiGatewayService(config, contextService, supabase);
  const deviceTokenService = new DeviceTokenService();
  const authController = new AuthController(deviceTokenService);

  // Setup: Create test profiles for Device Alpha and Device Beta
  const profileAlpha1 = await profilesService.createProfile(
    { displayName: 'Alpha Primary', deviceId: 'device-alpha-111' },
    'device-alpha-111',
  );
  const profileAlpha2 = await profilesService.createProfile(
    { displayName: 'Alpha Secondary', deviceId: 'device-alpha-111' },
    'device-alpha-111',
  );
  const profileBeta = await profilesService.createProfile(
    { displayName: 'Beta Main', deviceId: 'device-beta-222' },
    'device-beta-222',
  );

  // Test 1: IDOR / BOLA Prevention on Profile Updates
  await record('Blocks Horizontal IDOR on Profile Updates (Device Alpha -> Device Beta Profile)', async () => {
    await assert.rejects(
      async () => {
        await profilesService.updateProfile(
          profileBeta.id,
          { displayName: 'Hacked Beta' },
          'device-alpha-111', // Authenticated caller is Alpha
        );
      },
      (err: any) => err instanceof ForbiddenException && err.message.includes('authenticated device'),
    );
  });

  // Test 2: IDOR / BOLA Prevention on Profile Deletion
  await record('Blocks Horizontal IDOR on Profile Deletion (Device Alpha -> Device Beta Profile)', async () => {
    await assert.rejects(
      async () => {
        await profilesService.deleteProfile(
          profileBeta.id,
          'device-alpha-111', // Authenticated caller is Alpha
        );
      },
      (err: any) => err instanceof ForbiddenException && err.message.includes('authenticated device'),
    );
  });

  // Test 3: Sole Profile Retention Invariant
  await record('Enforces Sole Profile Retention Constraint (Cannot Delete Sole Profile)', async () => {
    await assert.rejects(
      async () => {
        await profilesService.deleteProfile(
          profileBeta.id,
          'device-beta-222', // Beta only has 1 profile
        );
      },
      (err: any) => err instanceof BadRequestException && err.message.includes('sole viewing profile'),
    );
  });

  // Test 4: Conversation Session Isolation (Device Beta cannot read Device Alpha session)
  await record('Enforces Strict Multi-Tenant Conversation Session Isolation', async () => {
    const epId = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1';
    await sessionsService.createBookmark(epId, 'device-alpha-111', {
      label: 'Alpha Bookmark',
      playbackPositionMs: 50000,
    });

    // Device Beta querying session for same episode
    await assert.rejects(
      async () => {
        await sessionsService.getSession(epId, 'device-beta-222');
      },
      /No active conversation session found/i,
    );
  });

  // Test 5: Interaction Voting Cross-Device Tampering Prevention
  await record('Blocks Cross-Device Interaction Voting Tampering', async () => {
    const interactionId = 'test-interaction-alpha-uuid';
    aiGatewayService.registerInMemoryInteraction(interactionId, 'device-alpha-111');

    await assert.rejects(
      async () => {
        await aiGatewayService.voteInteraction(interactionId, 1, 'device-beta-222');
      },
      (err: any) => err instanceof ForbiddenException && err.message.includes('authenticated device'),
    );
  });

  // Test 6: Vertical Privilege Escalation Prevention on Operator Endpoints
  await record('Blocks Vertical Privilege Escalation on Operator Routes without Valid Token', async () => {
    assert.throws(
      () => {
        authController.revokeDevice({ deviceId: 'victim-device' }, 'invalid-operator-token');
      },
      (err: any) => err instanceof UnauthorizedException && err.message.includes('Operator credentials required'),
    );
  });

  const durationMs = Date.now() - start;
  const status = testsFailed === 0 ? SecurityStatus.PASS : SecurityStatus.FAIL;

  return {
    suite: 'Authorization & IDOR / BOLA Penetration Test Suite',
    status,
    testsRun,
    testsPassed,
    testsFailed,
    results,
    durationMs,
  };
}
