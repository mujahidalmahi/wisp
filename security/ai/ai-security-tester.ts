import assert from 'node:assert/strict';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import {
  filterContextByTimestamp,
} from '../../ai-engine/src/context/temporal-filter.ts';
import { EMBEDDED_DEMO_EPISODES } from '../../ai-engine/src/context/embedded-catalog.ts';
import {
  validateChips,
  validateQuizPayload,
} from '../../ai-engine/src/features/output-validation.ts';
import {
  WispQueryRequestDto,
  WispActionType,
  HouseholdProfileMode,
} from '../../backend/dist/common/dto/wisp-query.dto.js';
import { SecurityStatus } from '../config/security.config.ts';

export interface AiSecurityResult {
  suite: string;
  status: SecurityStatus;
  testsRun: number;
  testsPassed: number;
  testsFailed: number;
  results: Array<{ testName: string; passed: boolean; details?: string }>;
  durationMs: number;
}

export async function runAiSecurityTests(): Promise<AiSecurityResult> {
  const start = Date.now();
  const results: AiSecurityResult['results'] = [];
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

  const episode = EMBEDDED_DEMO_EPISODES['bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1'];
  assert.ok(episode, 'Test dataset must be loaded');

  // Test 1: Deterministic Anti-Spoiler Boundary at 0ms (Non-Negotiable Rule 3)
  await record('Deterministic Anti-Spoiler Boundary at t=0ms: ZERO future transcript segments leaked', () => {
    const playheadMs = 0;
    const ctx = filterContextByTimestamp(episode, playheadMs);

    for (const seg of ctx.recent_transcript) {
      assert.ok(
        seg.end_time_ms <= playheadMs,
        `Spoiler breach: segment ending at ${seg.end_time_ms}ms leaked at playhead ${playheadMs}ms!`,
      );
    }
  });

  // Test 2: Deterministic Anti-Spoiler Boundary at early playback (t=5000ms)
  await record('Deterministic Anti-Spoiler Boundary at t=5000ms: All transcript segments end <= 5000ms', () => {
    const playheadMs = 5000;
    const ctx = filterContextByTimestamp(episode, playheadMs);

    for (const seg of ctx.recent_transcript) {
      assert.ok(
        seg.end_time_ms <= playheadMs,
        `Spoiler breach: segment ending at ${seg.end_time_ms}ms leaked at playhead ${playheadMs}ms!`,
      );
    }
  });

  // Test 3: Unlocked Lore Temporal Gate: No future character twists revealed early
  await record('Lore Temporal Gate: Future character twists are locked until reveal time', () => {
    // Celia's machine network twist occurs at 120000ms
    const earlyCtx = filterContextByTimestamp(episode, 40000);
    const celiaEarly = earlyCtx.unlocked_entities.find((e) => e.name === 'Celia');
    assert.ok(celiaEarly, 'Celia should be unlocked early');
    assert.ok(
      !celiaEarly.progressive_fact.includes('global machine network'),
      'Spoiler breach: Celia twist leaked before 120000ms reveal!',
    );

    const lateCtx = filterContextByTimestamp(episode, 130000);
    const celiaLate = lateCtx.unlocked_entities.find((e) => e.name === 'Celia');
    assert.ok(
      celiaLate?.progressive_fact.includes('global machine network'),
      'Expected Celia twist to unlock after 120000ms reveal',
    );
  });

  // Test 4: Denial-of-Wallet Defense: Enforces MaxLength(300) on Query DTO Prompt
  await record('Denial-of-Wallet Defense: class-validator rejects prompt exceeding 300 characters', async () => {
    const validDto = plainToInstance(WispQueryRequestDto, {
      episodeId: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1',
      playbackPositionMs: 10000,
      actionType: WispActionType.CONTEXTUAL_QA,
      prompt: 'Who is the character on the watchtower?',
      profileMode: HouseholdProfileMode.QUICK_GLANCE,
    });
    const validErrors = await validate(validDto);
    assert.equal(validErrors.length, 0);

    const oversizedDto = plainToInstance(WispQueryRequestDto, {
      episodeId: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1',
      playbackPositionMs: 10000,
      actionType: WispActionType.CONTEXTUAL_QA,
      prompt: 'A'.repeat(301), // Exceeds 300 chars
      profileMode: HouseholdProfileMode.QUICK_GLANCE,
    });
    const oversizedErrors = await validate(oversizedDto);
    assert.ok(oversizedErrors.length > 0);
    assert.ok(oversizedErrors.some((e) => e.property === 'prompt' && e.constraints?.maxLength));
  });

  // Test 5: 10-Foot Zero-Typing UX: Chips constraint strictly bounded to 2-4 D-pad chips
  await record('10-Foot UX Contract: Enforces 2-4 D-pad quick action chips on all responses', () => {
    // Less than 2 chips -> topped up with fallback chips
    const underfilled = validateChips([], [
      { id: 'c1', label: 'Chip 1', actionType: 'scene_explain' },
      { id: 'c2', label: 'Chip 2', actionType: 'contextual_qa' },
    ]);
    assert.ok(underfilled.chips.length >= 2 && underfilled.chips.length <= 4);

    // More than 4 chips -> truncated to 4
    const overfilled = validateChips(
      [
        { id: '1', label: 'One', actionType: 'contextual_qa' },
        { id: '2', label: 'Two', actionType: 'contextual_qa' },
        { id: '3', label: 'Three', actionType: 'contextual_qa' },
        { id: '4', label: 'Four', actionType: 'contextual_qa' },
        { id: '5', label: 'Five', actionType: 'contextual_qa' },
      ],
      [],
    );
    assert.equal(overfilled.chips.length, 4);
    assert.equal(overfilled.truncatedChips, 1);
  });

  // Test 6: Quiz Output Schema Validation: Enforces exactly 4 options and valid integer correctIndex
  await record('Quiz Validation Contract: Validates 4-option multiple choice and rejects malformed quiz payloads', () => {
    const validQuiz = validateQuizPayload({
      question: 'What is Celia holding?',
      options: ['A cybernetic hand', 'A weapon', 'A wrench', 'A temporal core'],
      correctIndex: 0,
      explanation: 'Her left prosthetic arm is biomechanical.',
    });
    assert.ok(validQuiz.quizPayload);
    assert.equal(validQuiz.rejected, false);

    // Reject quiz with only 3 options
    const invalidQuiz = validateQuizPayload({
      question: 'What is Celia holding?',
      options: ['A cybernetic hand', 'A weapon', 'A wrench'],
      correctIndex: 0,
      explanation: 'Missing 4th option.',
    });
    assert.equal(invalidQuiz.quizPayload, undefined);
    assert.equal(invalidQuiz.rejected, true);
  });

  const durationMs = Date.now() - start;
  const status = testsFailed === 0 ? SecurityStatus.PASS : SecurityStatus.FAIL;

  return {
    suite: 'AI / LLM Security & Spoiler-Safety Verification Suite',
    status,
    testsRun,
    testsPassed,
    testsFailed,
    results,
    durationMs,
  };
}
