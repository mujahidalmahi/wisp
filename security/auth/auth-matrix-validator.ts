import assert from 'node:assert/strict';
import * as crypto from 'crypto';
import * as jwtPackage from 'jsonwebtoken';
const jwt: any = (jwtPackage as any).default || jwtPackage;
import { DeviceTokenService } from '../../backend/dist/common/auth/device-token.service.js';
import { SecurityStatus, Severity } from '../config/security.config.ts';

export interface AuthMatrixResult {
  suite: string;
  status: SecurityStatus;
  testsRun: number;
  testsPassed: number;
  testsFailed: number;
  results: Array<{ testName: string; passed: boolean; details?: string }>;
  durationMs: number;
}

export async function runAuthMatrixTests(): Promise<AuthMatrixResult> {
  const start = Date.now();
  const results: AuthMatrixResult['results'] = [];
  let testsRun = 0;
  let testsPassed = 0;
  let testsFailed = 0;

  function record(testName: string, fn: () => void | Promise<void>) {
    testsRun++;
    try {
      fn();
      testsPassed++;
      results.push({ testName, passed: true });
    } catch (err: any) {
      testsFailed++;
      results.push({ testName, passed: false, details: err?.message });
    }
  }

  const deviceTokenService = new DeviceTokenService();

  // Test 1: Issues RFC 7519 compliant device token with HS256
  record('Issues RFC 7519 compliant device token with valid claims', () => {
    const result = deviceTokenService.authenticateAndIssueToken('device-auth-01', {
      enrollmentKey: 'wisp-dev-device-enrollment-secret-2026',
    });
    assert.ok(result.token);
    assert.equal(result.deviceId, 'device-auth-01');

    const decoded = jwt.decode(result.token) as any;
    assert.equal(decoded.typ, 'device-token');
    assert.equal(decoded.sub, 'device-auth-01');
    assert.equal(decoded.deviceId, 'device-auth-01');
    assert.equal(decoded.iss, 'wisp-device-auth');
    assert.equal(decoded.aud, 'wisp-firetv-client');
    assert.ok(decoded.exp > decoded.iat);
  });

  // Test 2: Cryptographic signature verification with timing safety
  record('Verifies legitimate signed device token', () => {
    const token = deviceTokenService.signDeviceToken('device-auth-02');
    const verified = deviceTokenService.verifyDeviceToken(token);
    assert.equal(verified.deviceId, 'device-auth-02');
  });

  // Test 3: Rejects forged signature attack
  record('Rejects forged signature attack (tampered payload or invalid secret)', () => {
    const forgedToken = jwt.sign(
      { deviceId: 'device-auth-03', sub: 'device-auth-03', typ: 'device-token' },
      'attacker-forged-secret-key-1234567890',
      { algorithm: 'HS256', issuer: 'wisp-device-auth', audience: 'wisp-firetv-client' },
    );
    assert.throws(
      () => deviceTokenService.verifyDeviceToken(forgedToken),
      /Invalid device token cryptographic signature/,
    );
  });

  // Test 4: Rejects algorithm confusion "none" attack
  record('Rejects algorithm confusion "none" attack', () => {
    const noneHeader = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
    const payload = Buffer.from(
      JSON.stringify({
        deviceId: 'device-auth-admin',
        sub: 'device-auth-admin',
        typ: 'device-token',
        iss: 'wisp-device-auth',
        aud: 'wisp-firetv-client',
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 3600,
      }),
    ).toString('base64url');
    const unsignedToken = `${noneHeader}.${payload}.`;

    assert.throws(
      () => deviceTokenService.verifyDeviceToken(unsignedToken),
      /Invalid device token cryptographic signature|algorithm/i,
    );
  });

  // Test 5: Rejects expired device token
  record('Rejects expired device token', () => {
    const expiredToken = jwt.sign(
      { deviceId: 'device-expired', sub: 'device-expired', typ: 'device-token' },
      'wisp-dev-device-token-secret-2026',
      {
        algorithm: 'HS256',
        issuer: 'wisp-device-auth',
        audience: 'wisp-firetv-client',
        expiresIn: -60, // Expired 60s ago
      },
    );
    assert.throws(
      () => deviceTokenService.verifyDeviceToken(expiredToken),
      /Device token has expired/,
    );
  });

  // Test 6: Enforces single-use enrollment code and prevents replay
  record('Enforces single-use enrollment challenge and blocks replay attacks', () => {
    const challenge = deviceTokenService.createEnrollmentChallenge('device-replay-target');
    assert.ok(challenge.enrollmentCode);

    // First enrollment succeeds
    const firstEnroll = deviceTokenService.authenticateAndIssueToken('device-replay-target', {
      enrollmentCode: challenge.enrollmentCode,
    });
    assert.ok(firstEnroll.token);

    // Second enrollment with reused code fails
    assert.throws(
      () =>
        deviceTokenService.authenticateAndIssueToken('device-replay-target', {
          enrollmentCode: challenge.enrollmentCode,
        }),
      /invalid, expired, or already-consumed enrollment code/i,
    );
  });

  // Test 7: Instant device revocation
  record('Revokes device instantly and denies token verification', () => {
    const token = deviceTokenService.signDeviceToken('device-revoked-01');
    assert.equal(deviceTokenService.verifyDeviceToken(token).deviceId, 'device-revoked-01');

    deviceTokenService.revokeDevice('device-revoked-01', 'Compromised hardware reported');
    assert.ok(deviceTokenService.isDeviceRevoked('device-revoked-01'));

    assert.throws(
      () => deviceTokenService.verifyDeviceToken(token),
      /has been revoked/i,
    );
  });

  // Test 8: Device secret derivation & constant-time renewal verification
  record('Derives deterministic device secrets with HMAC-SHA256 and validates constant-time', () => {
    const secret = deviceTokenService.deriveDeviceSecret('device-renew-01');
    assert.ok(typeof secret === 'string' && secret.length === 64);

    assert.ok(deviceTokenService.verifyDeviceSecret('device-renew-01', secret));
    assert.ok(!deviceTokenService.verifyDeviceSecret('device-renew-01', 'tampered-secret-value'));
    assert.ok(!deviceTokenService.verifyDeviceSecret('device-other', secret));
  });

  const durationMs = Date.now() - start;
  const status = testsFailed === 0 ? SecurityStatus.PASS : SecurityStatus.FAIL;

  return {
    suite: 'Authentication & Credential Penetration Test Matrix',
    status,
    testsRun,
    testsPassed,
    testsFailed,
    results,
    durationMs,
  };
}
