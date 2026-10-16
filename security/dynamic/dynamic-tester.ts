import assert from 'node:assert/strict';
import { CsrfService } from '../../backend/dist/common/security/csrf.service.js';
import { CsrfAndOriginGuard } from '../../backend/dist/common/security/csrf-and-origin.guard.js';
import { DatabaseRateLimitGuard } from '../../backend/dist/common/security/database-rate-limit.guard.js';
import { RequestCorrelationInterceptor } from '../../backend/dist/common/interceptors/correlation.interceptor.js';
import { GlobalHttpExceptionFilter } from '../../backend/dist/common/filters/http-exception.filter.js';
import { DeviceTokenService } from '../../backend/dist/common/auth/device-token.service.js';
import { SupabaseService } from '../../backend/dist/modules/supabase/supabase.service.js';
import { ConfigService } from '@nestjs/config';
import {
  ForbiddenException,
  UnauthorizedException,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { of } from 'rxjs';
import { SecurityStatus } from '../config/security.config.ts';

export interface DynamicTestResult {
  suite: string;
  status: SecurityStatus;
  testsRun: number;
  testsPassed: number;
  testsFailed: number;
  results: Array<{ testName: string; passed: boolean; details?: string }>;
  durationMs: number;
}

export async function runDynamicSecurityTests(): Promise<DynamicTestResult> {
  const start = Date.now();
  const results: DynamicTestResult['results'] = [];
  let testsRun = 0;
  let testsPassed = 0;
  let testsFailed = 0;

  async function record(testName: string, fn: () => void | Promise<void>) {
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

  const csrfService = new CsrfService();
  const deviceTokenService = new DeviceTokenService();
  const csrfGuard = new CsrfAndOriginGuard(csrfService, deviceTokenService);
  const supabase = new SupabaseService(new ConfigService({}));
  const rateLimitGuard = new DatabaseRateLimitGuard(supabase, deviceTokenService);

  // Test 1: Cross-site state-changing request blocked immediately
  await record('CsrfAndOriginGuard: Blocks Sec-Fetch-Site: cross-site requests with 403 Forbidden', () => {
    const mockContext = {
      switchToHttp: () => ({
        getRequest: () => ({
          method: 'POST',
          url: '/api/v1/profiles',
          headers: {
            'sec-fetch-site': 'cross-site',
            origin: 'http://localhost:3000',
          },
          ip: '192.0.2.1',
        }),
      }),
    } as any;

    assert.throws(
      () => csrfGuard.canActivate(mockContext),
      (err: any) => err instanceof ForbiddenException && /cross-site/i.test(err.message),
    );
  });

  // Test 2: Unauthorized Origin Header Blocked
  await record('CsrfAndOriginGuard: Blocks Unauthorized Origin Header', () => {
    const mockContext = {
      switchToHttp: () => ({
        getRequest: () => ({
          method: 'POST',
          url: '/api/v1/profiles',
          headers: {
            origin: 'https://evil-attacker-site.com',
          },
          ip: '192.0.2.1',
        }),
      }),
    } as any;

    assert.throws(
      () => csrfGuard.canActivate(mockContext),
      (err: any) => err instanceof ForbiddenException && err.message.includes('not permitted'),
    );
  });

  // Test 3: Missing CSRF token for browser state-changing request
  await record('CsrfAndOriginGuard: Enforces HMAC CSRF token on browser state-changing requests', () => {
    const mockContext = {
      switchToHttp: () => ({
        getRequest: () => ({
          method: 'POST',
          url: '/api/v1/profiles',
          headers: {
            origin: 'http://localhost:3000',
          },
          ip: '127.0.0.1',
        }),
      }),
    } as any;

    assert.throws(
      () => csrfGuard.canActivate(mockContext),
      (err: any) => err instanceof ForbiddenException && err.message.includes('Missing CSRF token'),
    );
  });

  // Test 4: Rate Limiting & 429 Too Many Requests Header Verification
  await record('DatabaseRateLimitGuard: Enforces request bounds and returns HTTP 429 with Retry-After', async () => {
    const headersEmitted: Record<string, string> = {};
    const mockResponse = {
      setHeader: (key: string, val: string) => {
        headersEmitted[key.toLowerCase()] = val;
      },
    };

    const mockContext = {
      switchToHttp: () => ({
        getRequest: () => ({
          method: 'GET',
          path: '/api/v1/catalog/programs',
          deviceId: 'device-test-throttle-id',
          headers: {},
        }),
        getResponse: () => mockResponse,
      }),
    } as any;

    // Send 30 requests (allowed)
    for (let i = 0; i < 30; i++) {
      await rateLimitGuard.canActivate(mockContext);
    }
    assert.equal(headersEmitted['x-ratelimit-limit'], '30');

    // 31st request triggers 429
    await assert.rejects(
      async () => {
        await rateLimitGuard.canActivate(mockContext);
      },
      (err: any) => err instanceof HttpException && err.getStatus() === HttpStatus.TOO_MANY_REQUESTS,
    );
    assert.ok(headersEmitted['retry-after']);
  });

  // Test 5: CRLF Header Injection Defense in Correlation Interceptor
  await record('RequestCorrelationInterceptor: Neutralizes CRLF Newline Injection in X-Request-Id', () => {
    const interceptor = new RequestCorrelationInterceptor();
    const headersEmitted: Record<string, string> = {};
    const mockReq: any = {
      headers: {
        'x-request-id': 'legit-id\r\nSet-Cookie: session=hijacked',
      },
    };
    const mockRes: any = {
      setHeader: (k: string, v: string) => {
        headersEmitted[k] = v;
      },
    };
    const mockContext = {
      switchToHttp: () => ({
        getRequest: () => mockReq,
        getResponse: () => mockRes,
      }),
    } as any;

    interceptor.intercept(mockContext, { handle: () => of(null) } as any).subscribe();
    // Sanitized value must NOT contain CRLF or Set-Cookie
    assert.ok(!headersEmitted['X-Request-Id'].includes('\r'));
    assert.ok(!headersEmitted['X-Request-Id'].includes('\n'));
    assert.ok(!headersEmitted['X-Request-Id'].includes('Set-Cookie'));
  });

  const durationMs = Date.now() - start;
  const status = testsFailed === 0 ? SecurityStatus.PASS : SecurityStatus.FAIL;

  return {
    suite: 'Dynamic HTTP Security & Guard Testing Suite',
    status,
    testsRun,
    testsPassed,
    testsFailed,
    results,
    durationMs,
  };
}
