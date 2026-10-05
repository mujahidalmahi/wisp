import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { WispAiEngine } from '../../ai-engine/src/engine.ts';
import {
  DeterministicTestAiAdapter,
  FailingHttpTestAiAdapter,
  HangingTestAiAdapter,
  RecoveringAuthTestAiAdapter,
} from '../helpers/mock-ai-adapter.ts';
import { AiProviderRouter } from '../../ai-engine/src/providers/provider-router.ts';
import {
  AiProviderCallerAbortError,
  AiProviderHttpError,
  AiProvidersQuarantinedError,
  AiGlobalTimeoutError,
} from '../../ai-engine/src/providers/errors.ts';
import type { IAiModelAdapter } from '../../ai-engine/src/types/index.ts';

const episodeId = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1';

/**
 * Keeps one referenced handle alive for this file so a test that is waiting on a
 * provider deadline has something to wait *with*.
 *
 * The router unrefs its per-attempt budget timer (`unrefTimer` in errors.ts, see
 * docs/FRICTION_LOG.md FL-005) so a pending provider attempt can never hold the
 * process open, and the cooperative mock unrefs its own work timer for the same
 * reason. Those timers are the only pending work while a timeout test waits, so
 * in a bare `node --test` process the event loop drains and Node abandons the
 * whole file with "Promise resolution is still pending but the event loop has
 * already resolved" — reported as `cancelled`, not as a failure, which is why the
 * suite looked green. In production the HTTP server handle covers this gap; here
 * the guard stands in for it and is released in `after` so the runner can exit.
 */
const eventLoopGuard = setInterval(() => {}, 1 << 30);
after(() => clearInterval(eventLoopGuard));

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

/**
 * Asserts a rejection carries the expected class and hands the narrowed value
 * back, so a validator can read typed fields without a bare cast. `assert.ok` is
 * not a TypeScript assertion function in this repo's setup, so narrowing is
 * done here explicitly.
 */
function assertRejectedAs<T>(
  err: unknown,
  ctor: new (...args: never[]) => T,
  label: string,
): T {
  assert.ok(err instanceof ctor, `${label}: expected ${ctor.name}, received ${(err as Error)?.name}`);
  return err as T;
}

/**
 * Router-level double. Each variant reproduces one failure mode the router has
 * to classify: a hung adapter, an HTTP fault, or an adapter that raises its own
 * abort. `state.calls` / `state.aborted` let a test prove that work was or was
 * not actually started, rather than only inspecting the resulting message.
 */
function scriptedAdapter(
  name: string,
  options: {
    timeoutMs?: number;
    delayMs?: number;
    failWithStatus?: number;
    throwAbortLike?: boolean;
    hang?: boolean;
  } = {},
) {
  const state = { calls: 0, aborted: false };

  const adapter: IAiModelAdapter = {
    name,
    timeoutMs: options.timeoutMs,
    isConfigured: () => true,
    async complete(req) {
      state.calls += 1;

      if (options.delayMs) {
        await new Promise((resolve) => setTimeout(resolve, options.delayMs));
      }

      if (options.throwAbortLike) {
        throw Object.assign(new Error('The operation was aborted.'), { name: 'AbortError' });
      }

      if (options.failWithStatus !== undefined) {
        throw new AiProviderHttpError(name, options.failWithStatus, '{"detail":"simulated"}');
      }

      if (options.hang) {
        return new Promise<never>((_resolve, reject) => {
          const onAbort = () => {
            state.aborted = true;
            reject(req.signal?.reason ?? new Error('aborted'));
          };
          if (req.signal?.aborted) {
            onAbort();
            return;
          }
          req.signal?.addEventListener('abort', onAbort, { once: true });
        });
      }

      return {
        providerName: name,
        latencyMs: options.delayMs ?? 0,
        rawText: '{"headline":"Mock card","body":"Mock body."}',
      };
    },
  };

  return { adapter, state };
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

  it('treats adapter-internal abort as internal, not caller cancellation', async () => {
    const aborter = scriptedAdapter('mock-abort', { throwAbortLike: true });
    const backup = scriptedAdapter('mock-abort-backup');
    const router = new AiProviderRouter({ adapters: [aborter.adapter, backup.adapter] });
    const callerSignal = new AbortController().signal;

    const result = await router.completeWithFallback({
      systemPrompt: 's',
      userPrompt: 'u',
      signal: callerSignal,
    });

    assert.equal(result.providerName, 'mock-abort-backup');
    assert.equal(aborter.state.calls, 1);
    assert.equal(callerSignal.aborted, false, 'the router must not cancel a live caller signal');
  });

  it('never reports an adapter-internal abort as "cancelled by caller"', async () => {
    const aborter = scriptedAdapter('mock-abort-only', { throwAbortLike: true });
    const router = new AiProviderRouter({ adapters: [aborter.adapter] });

    await assert.rejects(
      () => router.completeWithFallback({ systemPrompt: 's', userPrompt: 'u' }),
      (err: Error) => {
        assert.match(err.message, /mock-abort-only: aborted internally/);
        assert.doesNotMatch(err.message, /cancelled by caller/);
        return true;
      },
    );
  });

  it('throws AiProvidersQuarantinedError when all configured providers quarantined', async () => {
    const deadKey = scriptedAdapter('mock-q', { failWithStatus: 401 });
    const router = new AiProviderRouter({ adapters: [deadKey.adapter], providerQuarantineMs: 60000 });

    await assert.rejects(
      () => router.completeWithFallback({ systemPrompt: 's', userPrompt: 'u' }),
      (err: Error) => {
        assert.match(err.message, /mock-q: config-fault HTTP 401/);
        return true;
      },
    );

    await assert.rejects(
      () => router.completeWithFallback({ systemPrompt: 's', userPrompt: 'u' }),
      (err: unknown) => {
        const quarantined = assertRejectedAs(err, AiProvidersQuarantinedError, 'all providers quarantined');
        assert.doesNotMatch(
          quarantined.message,
          /No AI model adapters configured/,
          'a fully quarantined chain must not masquerade as an unconfigured engine',
        );
        assert.equal(quarantined.providers.length, 1);
        assert.equal(quarantined.providers[0].name, 'mock-q');
        assert.ok(quarantined.providers[0].retryInMs > 0, 'the error must report when the provider becomes eligible again');
        return true;
      },
    );

    assert.equal(deadKey.state.calls, 1, 'a quarantined provider must not be re-attempted');
  });

  it('lets a pre-aborted caller cancel ahead of a fully quarantined chain', async () => {
    const deadKey = scriptedAdapter('mock-dead-a', { failWithStatus: 401 });
    const alsoDead = scriptedAdapter('mock-dead-b', { failWithStatus: 403 });
    const router = new AiProviderRouter({
      adapters: [deadKey.adapter, alsoDead.adapter],
      providerQuarantineMs: 60000,
    });

    // Warm the quarantine with an uncancelled request so that *every* configured
    // provider is quarantined, which is the only state in which the chain is
    // unavailable rather than merely a failover.
    await assert.rejects(
      () => router.completeWithFallback({ systemPrompt: 's', userPrompt: 'u' }),
      /All configured AI providers failed/,
    );
    assert.equal(deadKey.state.calls, 1);
    assert.equal(alsoDead.state.calls, 1);

    // Both configured providers are now quarantined and the caller has already
    // cancelled, so cancellation must win over the availability report.
    const controller = new AbortController();
    const reason = new Error('viewer closed the drawer');
    controller.abort(reason);

    await assert.rejects(
      () => router.completeWithFallback({ systemPrompt: 's', userPrompt: 'u', signal: controller.signal }),
      (err: unknown) => {
        assert.ok(
          !(err instanceof AiProvidersQuarantinedError),
          `a cancelled request must not be reported as quarantine, received ${(err as Error).name}`,
        );
        const cancelled = assertRejectedAs(err, AiProviderCallerAbortError, 'pre-aborted caller');
        assert.equal(cancelled.providerName, 'router');
        assert.match(cancelled.message, /attempt cancelled by caller/);
        assert.match(cancelled.message, /viewer closed the drawer/);
        return true;
      },
    );

    assert.equal(deadKey.state.calls, 1, 'no provider work may start after the caller cancels');
    assert.equal(alsoDead.state.calls, 1, 'no failover may be attempted after the caller cancels');
  });

  it('lets a pre-aborted caller cancel ahead of an unconfigured engine', async () => {
    const router = new AiProviderRouter({ adapters: [{ name: 'never-configured', isConfigured: () => false } as never] });
    const controller = new AbortController();
    controller.abort(new Error('viewer closed the drawer'));

    await assert.rejects(
      () => router.completeWithFallback({ systemPrompt: 's', userPrompt: 'u', signal: controller.signal }),
      (err: unknown) => {
        assert.doesNotMatch(
          (err as Error).message,
          /No AI model adapters configured/,
          'a cancelled request must not be reported as a configuration fault',
        );
        const cancelled = assertRejectedAs(err, AiProviderCallerAbortError, 'pre-aborted caller, unconfigured engine');
        assert.equal(cancelled.providerName, 'router');
        return true;
      },
    );
  });

  it('still reports an unconfigured engine distinctly from a quarantined one', async () => {
    const router = new AiProviderRouter({ adapters: [{ name: 'never-configured', isConfigured: () => false } as never] });

    await assert.rejects(
      () => router.completeWithFallback({ systemPrompt: 's', userPrompt: 'u' }),
      (err: unknown) => {
        assert.ok(!(err instanceof AiProvidersQuarantinedError));
        assert.match((err as Error).message, /No AI model adapters configured/);
        return true;
      },
    );
  });

  it('raises AiGlobalTimeoutError naming the providers actually attempted', async () => {
    // The name deliberately contains ':' so a router that recovered names by
    // slicing the formatted failure string would report "mock" instead.
    const hung = scriptedAdapter('mock:slow', { hang: true, timeoutMs: 5000 });
    const router = new AiProviderRouter({ adapters: [hung.adapter], globalTimeoutMs: 80, minAttemptMs: 10 });

    const startedAt = Date.now();
    await assert.rejects(
      () => router.completeWithFallback({ systemPrompt: 's', userPrompt: 'u' }),
      (err: unknown) => {
        const timedOut = assertRejectedAs(err, AiGlobalTimeoutError, 'global ceiling reached');
        assert.equal(timedOut.timeoutMs, 80);
        assert.deepEqual(timedOut.attempts, ['mock:slow'], 'attempted names must be recorded, not parsed from a message');
        return true;
      },
    );

    assert.ok(Date.now() - startedAt < 1000, 'the ceiling must stop the chain near the global budget');
    assert.equal(hung.state.aborted, true, 'the in-flight attempt must actually be aborted at the ceiling');
  });

  it('skips the next provider when remaining global time drops below minAttemptMs', async () => {
    const slow = scriptedAdapter('mock-a', { delayMs: 60, failWithStatus: 500 });
    const skipped = scriptedAdapter('mock-b');
    const router = new AiProviderRouter({
      adapters: [slow.adapter, skipped.adapter],
      globalTimeoutMs: 200,
      minAttemptMs: 150,
      providerTimeoutMs: 1000,
    });

    await assert.rejects(
      () => router.completeWithFallback({ systemPrompt: 's', userPrompt: 'u' }),
      (err: unknown) => {
        const timedOut = assertRejectedAs(err, AiGlobalTimeoutError, 'insufficient remaining budget');
        assert.deepEqual(timedOut.attempts, ['mock-a'], 'the skipped provider was never attempted');
        assert.deepEqual(timedOut.failures, ['mock-a: retryable HTTP 500']);
        return true;
      },
    );

    assert.equal(skipped.state.calls, 0, 'no provider work may start without a useful budget');
  });

  it('honours a per-request global timeout override over the config default', async () => {
    const hung = scriptedAdapter('mock-hang', { hang: true, timeoutMs: 60000 });
    const router = new AiProviderRouter({ adapters: [hung.adapter], globalTimeoutMs: 60000 });

    const startedAt = Date.now();
    await assert.rejects(
      () =>
        router.completeWithFallback({
          systemPrompt: 's',
          userPrompt: 'u',
          timeoutMs: 90,
          minAttemptMs: 10,
        }),
      (err: unknown) => {
        const timedOut = assertRejectedAs(err, AiGlobalTimeoutError, 'per-request ceiling reached');
        assert.equal(timedOut.timeoutMs, 90, 'the request override must win over the engine default');
        return true;
      },
    );

    assert.ok(
      Date.now() - startedAt < 1500,
      'the per-request ceiling must beat both the config default and the adapter budget',
    );
  });

  it('honours a per-request quarantine duration override', async () => {
    const deadKey = scriptedAdapter('mock-quarantine', { failWithStatus: 401 });
    const router = new AiProviderRouter({ adapters: [deadKey.adapter], providerQuarantineMs: 600000 });

    await assert.rejects(
      () =>
        router.completeWithFallback({
          systemPrompt: 's',
          userPrompt: 'u',
          quarantineMs: 30,
        }),
      (err: Error) => {
        assert.match(err.message, /mock-quarantine: config-fault HTTP 401/);
        return true;
      },
    );

    await new Promise((resolve) => setTimeout(resolve, 60));

    await assert.rejects(
      () => router.completeWithFallback({ systemPrompt: 's', userPrompt: 'u', quarantineMs: 30 }),
      (err: unknown) => {
        assert.ok(
          !(err instanceof AiProvidersQuarantinedError),
          'the 30ms request cooldown must have expired long before the 600s engine default',
        );
        assert.match((err as Error).message, /mock-quarantine: config-fault HTTP 401/);
        return true;
      },
    );

    assert.equal(deadKey.state.calls, 2, 'the provider must become eligible again after the overridden cooldown');
  });

  it('keeps every shipped provider reachable inside the default global budget', () => {
    // The per-adapter budgets are only granted when the preceding ones leave at
    // least `minAttemptMs` behind, so raising one "to be safer" can silently
    // delete the providers after it. This pins the coupling the shipped
    // defaults have to satisfy; see docs/FRICTION_LOG.md FL-006.
    const readSource = (relative: string) =>
      fs.readFileSync(path.resolve(relative), 'utf8');

    const routerSource = readSource('ai-engine/src/providers/provider-router.ts');
    const globalTimeoutMs = Number(
      routerSource.match(/DEFAULT_GLOBAL_TIMEOUT_MS\s*=\s*(\d+)/)?.[1],
    );
    const minAttemptMs = Number(
      routerSource.match(/DEFAULT_MIN_ATTEMPT_MS\s*=\s*(\d+)/)?.[1],
    );

    assert.ok(globalTimeoutMs > 0, 'the router must declare a global request ceiling');
    assert.ok(minAttemptMs > 0, 'the router must declare a minimum useful attempt');

    const remoteAdapters = ['groq', 'gemini', 'openrouter'];
    const budgets = remoteAdapters.map((provider) => {
      const source = readSource(`ai-engine/src/providers/${provider}.adapter.ts`);
      const timeoutMs = Number(source.match(/readonly timeoutMs\s*=\s*(\d+)/)?.[1]);
      assert.ok(timeoutMs > 0, `${provider} must declare a per-request budget`);
      return { provider, timeoutMs };
    });

    const remoteBudgetMs = budgets.reduce((sum, entry) => sum + entry.timeoutMs, 0);
    assert.ok(
      remoteBudgetMs <= globalTimeoutMs - minAttemptMs,
      `sum of remote adapter budgets (${remoteBudgetMs}ms) must leave at least ` +
        `minAttemptMs (${minAttemptMs}ms) for the local ollama fallback inside the ` +
        `${globalTimeoutMs}ms ceiling; budgets: ${budgets
          .map((b) => `${b.provider}=${b.timeoutMs}ms`)
          .join(', ')}`,
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