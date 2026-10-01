import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { WispAiEngine } from '../../ai-engine/src/engine.ts';
import {
  DeterministicTestAiAdapter,
  FailingHttpTestAiAdapter,
  HangingTestAiAdapter,
  RecoveringAuthTestAiAdapter,
} from '../helpers/mock-ai-adapter.ts';
import { AiProviderRouter } from '../../ai-engine/src/providers/provider-router.ts';
import { AiProviderCallerAbortError } from '../../ai-engine/src/providers/errors.ts';

const episodeId = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1';

class ScriptedSignalRecorder {
  readonly name: string;
  private readonly seen: Array<AbortSignal | undefined>;

  constructor(name: string, seen: Array<AbortSignal | undefined>) {
    this.name = name;
    this.seen = seen;
  }

  isConfigured(): boolean {
    return true;
  }

  async complete(req: { userPrompt: string; signal?: AbortSignal }) {
    this.seen.push(req.signal);
    return {
      providerName: this.name,
      latencyMs: 5,
      rawText: JSON.stringify({
        headline: 'Recorded',
        body: 'Body.',
        bulletPoints: [],
        followUpChips: [
          { id: 'f1', label: 'Follow up one?', actionType: 'contextual_qa' },
          { id: 'f2', label: 'Follow up two?', actionType: 'entity_explain' },
        ],
      }),
    };
  }
}

describe('AI Integration: Provider Request Timeouts & Failure Classification', () => {

  const baseInput = {
    episodeId,
    playbackPositionMs: 50000,
    actionType: 'scene_explain' as const,
    prompt: 'Why are they arguing?',
  };

  it('aborts a hung primary at its per-provider budget and fails over to the backup', async () => {
    const engine = WispAiEngine.createStandalone({ enableCache: false });
    const hung = new HangingTestAiAdapter({ name: 'groq-hung', timeoutMs: 250 });
    const backup = new DeterministicTestAiAdapter({ name: 'gemini-flash-backup' });

    engine.registerModelAdapter(backup, 'first');
    engine.registerModelAdapter(hung, 'first');

    const startedAt = Date.now();
    const card = await engine.execute(baseInput);
    const elapsedMs = Date.now() - startedAt;

    assert.ok(elapsedMs < 2000, `expected abort near 250ms, took ${elapsedMs}ms`);
    assert.equal(card.providerUsed, 'gemini-flash-backup');
    assert.equal(hung.callCount, 1, 'hung provider must be attempted exactly once');
    assert.ok(hung.sawSignal, 'router must inject an AbortSignal into the adapter');
    assert.ok(hung.observedAbort, 'adapter must observe the signal actually aborting');
  });

  it('bounds an adapter that ignores the AbortSignal via the router deadline', async () => {
    const engine = WispAiEngine.createStandalone({ enableCache: false, providerTimeoutMs: 400 });
    const defiant = new HangingTestAiAdapter({
      name: 'signal-defiant-provider',
      hangForMs: 30000,
      respectSignal: false,
    });
    const backup = new DeterministicTestAiAdapter({ name: 'recovery-after-defiant' });

    engine.registerModelAdapter(backup, 'first');
    engine.registerModelAdapter(defiant, 'first');

    const startedAt = Date.now();
    const card = await engine.execute(baseInput);
    const elapsedMs = Date.now() - startedAt;

    assert.ok(elapsedMs < 3000, `router deadline must bound the attempt, took ${elapsedMs}ms`);
    assert.equal(card.providerUsed, 'recovery-after-defiant');
  });

  it('keeps total wall-clock bounded by the sum of budgets when every provider hangs', async () => {
    const engine = WispAiEngine.createStandalone({ enableCache: false });
    const first = new HangingTestAiAdapter({ name: 'hang-primary', timeoutMs: 200 });
    const second = new HangingTestAiAdapter({ name: 'hang-backup', timeoutMs: 200 });

    engine.registerModelAdapter(second, 'first');
    engine.registerModelAdapter(first, 'first');

    const startedAt = Date.now();
    await assert.rejects(
      () => engine.execute(baseInput),
      (err: Error) => {
        assert.match(err.message, /hang-primary: timed out after 200ms/);
        assert.match(err.message, /hang-backup: timed out after 200ms/);
        return true;
      },
    );
    const elapsedMs = Date.now() - startedAt;

    assert.ok(elapsedMs < 3000, `chain must not block on hung providers, took ${elapsedMs}ms`);
  });

  it('distinguishes credential faults from retryable upstream failures', async () => {
    const engine = WispAiEngine.createStandalone({ enableCache: false });
    const badKey = new FailingHttpTestAiAdapter({ name: 'groq-invalid-key', status: 401 });
    const rateLimited = new FailingHttpTestAiAdapter({ name: 'gemini-rate-limited', status: 429 });
    const upstreamDown = new FailingHttpTestAiAdapter({ name: 'openrouter-unavailable', status: 503 });

    engine.registerModelAdapter(upstreamDown, 'first');
    engine.registerModelAdapter(rateLimited, 'first');
    engine.registerModelAdapter(badKey, 'first');

    await assert.rejects(
      () => engine.execute(baseInput),
      (err: Error) => {
        assert.match(err.message, /groq-invalid-key: config-fault HTTP 401/);
        assert.match(err.message, /gemini-rate-limited: retryable HTTP 429/);
        assert.match(err.message, /openrouter-unavailable: retryable HTTP 503/);
        return true;
      },
    );

    assert.equal(badKey.callCount, 1, 'a 401 must not short-circuit the remaining providers');
    assert.equal(upstreamDown.callCount, 1);
  });

  it('drops a 401 provider from the configured set while quarantined', async () => {
    const router = new AiProviderRouter({ providerTimeoutMs: 100, providerQuarantineMs: 60000 });
    const revoked = new FailingHttpTestAiAdapter({ name: 'groq-401-router', status: 401 });
    const backup = new DeterministicTestAiAdapter({ name: 'gemini-after-401-router' });

    router.registerAdapter(backup, 'first');
    router.registerAdapter(revoked, 'first');

    const activeNames = () => router.getConfiguredAdapters().map((adapter) => adapter.name);
    assert.ok(activeNames().includes('groq-401-router'), 'starts eligible');

    await router.completeWithFallback({ systemPrompt: 's', userPrompt: '{}' });

    assert.ok(
      !activeNames().includes('groq-401-router'),
      'a 401 provider must leave the configured set',
    );
    assert.ok(activeNames().includes('gemini-after-401-router'));
  });

  it('keeps a 429 provider eligible, because rate limits clear on their own', async () => {
    const router = new AiProviderRouter({ providerTimeoutMs: 100, providerQuarantineMs: 60000 });
    const rateLimited = new FailingHttpTestAiAdapter({ name: 'groq-429-router', status: 429 });
    const backup = new DeterministicTestAiAdapter({ name: 'gemini-after-429-router' });

    router.registerAdapter(backup, 'first');
    router.registerAdapter(rateLimited, 'first');

    const activeNames = () => router.getConfiguredAdapters().map((adapter) => adapter.name);
    assert.ok(activeNames().includes('groq-429-router'), 'starts eligible');

    await router.completeWithFallback({ systemPrompt: 's', userPrompt: '{}' });

    assert.ok(
      activeNames().includes('groq-429-router'),
      'a 429 must NOT be quarantined; it can succeed on the next request',
    );
  });

  it('quarantines a credential-faulted provider so later requests skip the dead round trip', async () => {
    const engine = WispAiEngine.createStandalone({ enableCache: false, providerQuarantineMs: 60000 });
    const revokedKey = new FailingHttpTestAiAdapter({ name: 'groq-revoked-key', status: 401 });
    const backup = new DeterministicTestAiAdapter({ name: 'gemini-flash-backup' });

    engine.registerModelAdapter(backup, 'first');
    engine.registerModelAdapter(revokedKey, 'first');

    const firstCard = await engine.execute(baseInput);
    assert.equal(firstCard.providerUsed, 'gemini-flash-backup', 'backup serves the first request');
    assert.equal(revokedKey.callCount, 1);

    const recovered = await engine.execute(baseInput);
    assert.equal(recovered.providerUsed, 'gemini-flash-backup');
    assert.equal(revokedKey.callCount, 1, 'quarantined provider must not be retried while quarantined');
  });

  it('does not quarantine a retryable fault, because the provider may recover immediately', async () => {
    const engine = WispAiEngine.createStandalone({ enableCache: false });
    const rateLimited = new FailingHttpTestAiAdapter({ name: 'groq-rate-limited', status: 429 });
    const backup = new DeterministicTestAiAdapter({ name: 'gemini-flash-backup' });

    engine.registerModelAdapter(backup, 'first');
    engine.registerModelAdapter(rateLimited, 'first');

    await engine.execute(baseInput);
    assert.equal(rateLimited.callCount, 1);

    await engine.execute(baseInput);
    assert.equal(rateLimited.callCount, 2, 'a 429 must stay eligible on the very next request');
  });

  describe('AbortSignal delivery and cooperative termination', () => {
    it('aborts the provider signal so a cooperative adapter stops its real work', async () => {
      const engine = WispAiEngine.createStandalone({ enableCache: false });
      const cooperative = new HangingTestAiAdapter({
        name: 'cooperative-hung-provider',
        timeoutMs: 120,
        hangForMs: 30000,
      });
      const backup = new DeterministicTestAiAdapter({ name: 'cooperative-backup' });

      engine.registerModelAdapter(backup, 'first');
      engine.registerModelAdapter(cooperative, 'first');

      assert.equal(cooperative.workInFlight, false, 'no work before the call');

      const card = await engine.execute(baseInput);

      assert.equal(card.providerUsed, 'cooperative-backup');
      assert.ok(cooperative.sawSignal, 'router must inject a signal');
      assert.ok(cooperative.observedAbort, 'the adapter must observe the abort event');
      assert.equal(
        cooperative.workInFlight,
        false,
        'a cooperative adapter must not still be working after the timeout',
      );
      assert.equal(cooperative.callCount, 1, 'aborted work is abandoned, not retried');
    });

    it('passes a caller-supplied signal through without replacing it', async () => {
      const router = new AiProviderRouter({ providerTimeoutMs: 5000 });
      const seen: Array<AbortSignal | undefined> = [];
      const recorder = new ScriptedSignalRecorder('signal-recorder', seen);
      const backup = new DeterministicTestAiAdapter({ name: 'unused-recorder-backup' });

      router.registerAdapter(backup, 'first');
      router.registerAdapter(recorder, 'first');

      const callerSignal = new AbortController().signal;
      await router.completeWithFallback({ systemPrompt: 's', userPrompt: '{}', signal: callerSignal });

      assert.equal(seen.length, 1);
      assert.notEqual(seen[0], callerSignal, 'router composes its own signal rather than reusing');
      assert.equal(seen[0]?.aborted, false, 'caller signal must not be aborted by the router');
      assert.equal(callerSignal.aborted, false);
    });

    it('terminates a cooperative attempt when the caller aborts', async () => {
      const router = new AiProviderRouter({ providerTimeoutMs: 10000 });
      const cooperative = new HangingTestAiAdapter({
        name: 'caller-abort-cooperative',
        hangForMs: 30000,
      });
      router.registerAdapter(cooperative, 'first');

      const controller = new AbortController();
      const attempt = router.completeWithFallback({
        systemPrompt: 's',
        userPrompt: '{}',
        signal: controller.signal,
      });

      await new Promise((resolve) => setTimeout(resolve, 20));
      controller.abort(new Error('viewer closed the drawer'));

      await assert.rejects(
        () => attempt,
        (err: Error) => {
          assert.ok(
            err instanceof AiProviderCallerAbortError,
            `expected caller-abort error, received ${err.name}`,
          );
          assert.match(err.message, /viewer closed the drawer/);
          return true;
        },
      );

      assert.ok(cooperative.observedAbort, 'caller abort must reach the adapter signal');
      assert.equal(cooperative.workInFlight, false, 'cooperative adapter stopped its real work');
    });

    it('honours a caller signal that is already aborted before the attempt', async () => {
      const router = new AiProviderRouter({ providerTimeoutMs: 10000 });
      const cooperative = new HangingTestAiAdapter({ name: 'pre-aborted-provider' });
      router.registerAdapter(cooperative, 'first');

      const controller = new AbortController();
      controller.abort(new Error('already cancelled'));

      await assert.rejects(
        () =>
          router.completeWithFallback({
            systemPrompt: 's',
            userPrompt: '{}',
            signal: controller.signal,
          }),
        (err: Error) => {
          assert.ok(err instanceof AiProviderCallerAbortError, `received ${err.name}`);
          assert.match(err.message, /already cancelled/);
          return true;
        },
      );

      assert.equal(
        cooperative.callCount,
        0,
        'a pre-aborted caller signal must not start provider work',
      );
    });

    it('rejects a pre-aborted signal immediately even when the adapter ignores AbortSignal', async () => {
      const router = new AiProviderRouter({ providerTimeoutMs: 30000 });
      const defiant = new HangingTestAiAdapter({
        name: 'pre-aborted-defiant',
        hangForMs: 30000,
        respectSignal: false,
      });
      const backup = new DeterministicTestAiAdapter({ name: 'pre-aborted-backup' });
      router.registerAdapter(defiant, 'first');
      router.registerAdapter(backup, 'first');

      const controller = new AbortController();
      controller.abort(new Error('viewer closed the drawer'));

      const startedAt = Date.now();
      await assert.rejects(
        () =>
          router.completeWithFallback({
            systemPrompt: 's',
            userPrompt: '{}',
            signal: controller.signal,
          }),
        (err: Error) => err instanceof AiProviderCallerAbortError,
      );
      const elapsedMs = Date.now() - startedAt;

      assert.ok(elapsedMs < 1000, `router must not hang on a pre-aborted signal, took ${elapsedMs}ms`);
      assert.equal(defiant.callCount, 0, 'no provider work may start after cancellation');
      assert.equal(backup.callCount, 0, 'caller cancellation must not fail over to another provider');
    });

    it('aborts the adapter when the router budget fires and classifies it as a timeout', async () => {
      const router = new AiProviderRouter({ providerTimeoutMs: 120 });
      const cooperative = new HangingTestAiAdapter({
        name: 'budget-fired-provider',
        hangForMs: 30000,
      });
      const backup = new DeterministicTestAiAdapter({ name: 'budget-fired-backup' });
      router.registerAdapter(backup, 'first');
      router.registerAdapter(cooperative, 'first');

      const result = await router.completeWithFallback({ systemPrompt: 's', userPrompt: '{}' });

      assert.ok(cooperative.observedAbort, 'the adapter must receive the timeout abort');
      assert.equal(cooperative.workInFlight, false, 'the adapter must stop its real work');
      assert.equal(cooperative.callCount, 1, 'a timeout is not a caller cancellation, so fallback continues');
      assert.match(result.providerName, /budget-fired-backup/);
    });

    it('does not abort the provider signal on a successful completion', async () => {
      const router = new AiProviderRouter({ providerTimeoutMs: 5000 });
      const seen: Array<AbortSignal | undefined> = [];
      const recorder = new ScriptedSignalRecorder('success-signal-recorder', seen);
      router.registerAdapter(recorder, 'first');

      const result = await router.completeWithFallback({ systemPrompt: 's', userPrompt: '{}' });

      assert.match(result.providerName, /success-signal-recorder/);
      assert.equal(seen[0]?.aborted, false, 'signal must survive a successful attempt');
    });

    it('still bounds a non-cooperative adapter that ignores the signal', async () => {
      const router = new AiProviderRouter({ providerTimeoutMs: 150 });
      const defiant = new HangingTestAiAdapter({
        name: 'signal-defiant-router',
        hangForMs: 30000,
        respectSignal: false,
      });
      const backup = new DeterministicTestAiAdapter({ name: 'defiant-router-backup' });

      router.registerAdapter(backup, 'first');
      router.registerAdapter(defiant, 'first');

      const startedAt = Date.now();
      const result = await router.completeWithFallback({ systemPrompt: 's', userPrompt: '{}' });
      const elapsedMs = Date.now() - startedAt;

      assert.ok(elapsedMs < 2000, `router must bound the wait, took ${elapsedMs}ms`);
      assert.match(result.providerName, /defiant-router-backup/);
      assert.equal(defiant.observedAbort, false, 'this adapter never observes the abort');
    });
  });

  it('expires quarantine so a rotated key recovers without a process restart', async () => {
    const engine = WispAiEngine.createStandalone({ enableCache: false, providerQuarantineMs: 40 });
    const recoveredKey = new RecoveringAuthTestAiAdapter({ name: 'groq-rotated-key', failCalls: 1 });
    const backup = new DeterministicTestAiAdapter({ name: 'gemini-flash-backup' });

    engine.registerModelAdapter(backup, 'first');
    engine.registerModelAdapter(recoveredKey, 'first');

    const firstCard = await engine.execute(baseInput);
    assert.equal(firstCard.providerUsed, 'gemini-flash-backup', 'backup covers while the key is dead');
    assert.equal(recoveredKey.callCount, 1);

    await new Promise((resolve) => setTimeout(resolve, 70));

    const card = await engine.execute(baseInput);
    assert.equal(recoveredKey.callCount, 2, 'quarantine must expire and the provider be retried');
    assert.equal(card.providerUsed, 'groq-rotated-key');
  });
});