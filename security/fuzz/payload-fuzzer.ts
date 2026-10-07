import assert from 'node:assert/strict';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import {
  WispQueryRequestDto,
  WispActionType,
  HouseholdProfileMode,
} from '../../backend/dist/common/dto/wisp-query.dto.js';
import { CatalogService } from '../../backend/dist/modules/catalog/catalog.service.js';
import { SupabaseService } from '../../backend/dist/modules/supabase/supabase.service.js';
import { ConfigService } from '@nestjs/config';
import { BadRequestException } from '@nestjs/common';
import { SecurityStatus } from '../config/security.config.ts';

export interface FuzzTestResult {
  suite: string;
  status: SecurityStatus;
  testsRun: number;
  testsPassed: number;
  testsFailed: number;
  results: Array<{ testName: string; passed: boolean; details?: string }>;
  durationMs: number;
}

export async function runFuzzTests(): Promise<FuzzTestResult> {
  const start = Date.now();
  const results: FuzzTestResult['results'] = [];
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

  const catalog = new CatalogService(new SupabaseService(new ConfigService({})));

  // Test 1: Negative Integer Boundary Fuzzing
  await record('Fuzzing negative playbackPositionMs: Rejected by class-validator @Min(0)', async () => {
    const dto = plainToInstance(WispQueryRequestDto, {
      episodeId: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1',
      playbackPositionMs: -9999999,
      actionType: WispActionType.CONTEXTUAL_QA,
      prompt: 'Valid query',
    });
    const errors = await validate(dto);
    assert.ok(errors.length > 0);
    assert.ok(errors.some((e) => e.property === 'playbackPositionMs' && e.constraints?.min));
  });

  // Test 2: Invalid ActionType Enum Fuzzing
  await record('Fuzzing invalid actionType enum: Rejected by class-validator @IsEnum', async () => {
    const maliciousActionTypes = [
      '__proto__',
      'constructor',
      'DROP_TABLE',
      'admin_escalate',
      'system_shell',
      '',
    ];

    for (const act of maliciousActionTypes) {
      const dto = plainToInstance(WispQueryRequestDto, {
        episodeId: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1',
        playbackPositionMs: 5000,
        actionType: act as any,
        prompt: 'Valid query',
      });
      const errors = await validate(dto);
      assert.ok(errors.length > 0, `Expected validation error for actionType: "${act}"`);
    }
  });

  // Test 3: Corrupted Base64URL Cursor Fuzzing
  await record('Fuzzing pagination cursor: Rejects malformed and injection cursors with 400 BadRequest', async () => {
    const corruptCursors = [
      'not-base64-at-all!!',
      'YWJj', // valid base64 of 'abc' (not json)
      Buffer.from(JSON.stringify({ title: 'Tears', id: 'not-a-uuid' })).toString('base64url'),
      Buffer.from(JSON.stringify({ title: 'Tears"; DROP TABLE--', id: '00000000-0000-0000-0000-000000000000' })).toString('base64url'),
      Buffer.from(JSON.stringify({ id: '00000000-0000-0000-0000-000000000000' })).toString('base64url'), // missing title
      'A'.repeat(600), // oversized cursor (>512 chars)
    ];

    for (const cur of corruptCursors) {
      await assert.rejects(
        async () => {
          await catalog.listPrograms({ cursor: cur });
        },
        (err: any) => err instanceof BadRequestException && err.message.includes('Invalid pagination cursor'),
      );
    }
  });

  // Test 4: Extreme Unicode Surrogate Pairs, Zalgo, and Multi-Byte Emojis Fuzzing
  await record('Fuzzing complex Unicode, Zalgo text, and emoji sequences', async () => {
    const zalgoText = 'T̷e̴s̷t̶ ̶Z̸a̵l̷g̵o̵ ̶P̴a̵y̷l̶o̵a̸d̴ 🧙‍♂️👩‍👩‍👧‍👦✨';
    const dto = plainToInstance(WispQueryRequestDto, {
      episodeId: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1',
      playbackPositionMs: 12000,
      actionType: WispActionType.CONTEXTUAL_QA,
      prompt: zalgoText,
    });
    const errors = await validate(dto);
    assert.equal(errors.length, 0); // Natural Unicode text is gracefully accepted
  });

  const durationMs = Date.now() - start;
  const status = testsFailed === 0 ? SecurityStatus.PASS : SecurityStatus.FAIL;

  return {
    suite: 'Robustness & Fuzz Testing Suite',
    status,
    testsRun,
    testsPassed,
    testsFailed,
    results,
    durationMs,
  };
}
