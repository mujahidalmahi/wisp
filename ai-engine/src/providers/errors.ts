export class AiProviderTimeoutError extends Error {
  readonly providerName: string;
  readonly timeoutMs: number;

  constructor(providerName: string, timeoutMs: number) {
    super(`${providerName} exceeded its ${timeoutMs}ms budget and was aborted`);
    this.name = 'AiProviderTimeoutError';
    this.providerName = providerName;
    this.timeoutMs = timeoutMs;
  }
}

export class AiProviderHttpError extends Error {
  readonly providerName: string;
  readonly status: number;
  readonly body: string;

  constructor(providerName: string, status: number, body: string) {
    super(`${providerName} HTTP ${status}: ${truncateBody(body)}`);
    this.name = 'AiProviderHttpError';
    this.providerName = providerName;
    this.status = status;
    this.body = truncateBody(body);
  }

  isRetryable(): boolean {
    if (this.status === 408 || this.status === 429) {
      return true;
    }
    return this.status >= 500;
  }

  isConfigFault(): boolean {
    return this.status === 401 || this.status === 403 || this.status === 404;
  }
}

/**
 * Raised when the caller's own signal aborts an in-flight provider attempt,
 * distinct from the router's per-provider timeout budget.
 */
export class AiProviderCallerAbortError extends Error {
  readonly providerName: string;

  constructor(providerName: string, reason?: unknown) {
    super(`${providerName} attempt cancelled by caller${describeReason(reason)}`);
    this.name = 'AiProviderCallerAbortError';
    this.providerName = providerName;
  }
}

/**
 * Raised when an adapter aborts internally (e.g., its own AbortSignal) rather
 * than the caller explicitly cancelling the request.
 */
export class AiGlobalTimeoutError extends Error {
  readonly timeoutMs: number;
  readonly attempts: string[];

  constructor(timeoutMs: number, attempts: string[] = []) {
    super(
      attempts.length
        ? `Global request timeout (${timeoutMs}ms) after attempting: ${attempts.join(', ')}`
        : `Global request timeout (${timeoutMs}ms)`,
    );
    this.name = 'AiGlobalTimeoutError';
    this.timeoutMs = timeoutMs;
    this.attempts = attempts;
  }
}

export class AiProviderInternalAbortError extends Error {
  readonly providerName: string;

  constructor(providerName: string, reason?: unknown) {
    const message = (reason as { message?: string } | null)?.message;
    super(
      message
        ? `${providerName} aborted internally: ${message}`
        : `${providerName} aborted internally`,
    );
    this.name = 'AiProviderInternalAbortError';
    this.providerName = providerName;
  }
}

/**
 * Raised when all configured providers are temporarily quarantined.
 */
export class AiProvidersQuarantinedError extends Error {
  readonly providers: { name: string; retryInMs: number }[];

  constructor(providers: { name: string; retryInMs: number }[]) {
    super(
      `All configured AI providers are temporarily quarantined -> ${providers
        .map((p) => `${p.name} (retry in ${Math.ceil(p.retryInMs / 1000)}s)`)
        .join(', ')}`,
    );
    this.name = 'AiProvidersQuarantinedError';
    this.providers = providers;
  }
}

/**
 * Stops a Node timer from holding the process open. Under the DOM lib the return
 * type is a number, so the capability is probed rather than assumed.
 */
export function unrefTimer<T>(timer: T): T {
  const maybeNodeTimer = timer as { unref?: () => void };
  maybeNodeTimer.unref?.();
  return timer;
}

/**
 * Combines the router's budget controller with a caller-supplied signal so both
 * cancellation sources reach the adapter. Falls back to the controller alone on
 * runtimes without AbortSignal.any, where the router mirrors caller aborts onto
 * the controller and behaviour is preserved either way.
 */
export function composeAbortSignal(
  controllerSignal: AbortSignal,
  callerSignal?: AbortSignal,
): AbortSignal {
  if (!callerSignal) {
    return controllerSignal;
  }
  if (typeof AbortSignal.any === 'function') {
    return AbortSignal.any([controllerSignal, callerSignal]);
  }
  return controllerSignal;
}

function describeReason(reason: unknown): string {
  const message = (reason as { message?: string } | null)?.message;
  return message ? `: ${message}` : '';
}

export function isAbortLikeError(err: unknown): boolean {
  const name = (err as { name?: string } | null)?.name;
  return name === 'AbortError' || name === 'TimeoutError';
}

function truncateBody(body: string): string {
  const trimmed = (body || '').trim();
  return trimmed.length > 240 ? `${trimmed.slice(0, 240)}...` : trimmed;
}