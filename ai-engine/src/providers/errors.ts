<<<<<<< HEAD
export class AiProviderHttpError extends Error {
  readonly providerName: string;
  readonly status: number;
  readonly responseBody?: string;

  constructor(providerName: string, status: number, responseBody?: string) {
    super(`${providerName}: HTTP ${status}`);
    this.name = 'AiProviderHttpError';
    this.providerName = providerName;
    this.status = status;
    this.responseBody = responseBody;
  }
}

export class AiProviderCallerAbortError extends Error {
  readonly providerName: string;

  constructor(providerName: string, message = 'The operation was aborted.') {
    super(message);
=======
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
>>>>>>> 324233b (fix(testing): resolve event loop promise leaks and update schema test paths)
    this.name = 'AiProviderCallerAbortError';
    this.providerName = providerName;
  }
}

<<<<<<< HEAD
export class AiGlobalTimeoutError extends Error {
  readonly attemptedProviders: string[];

  constructor(message: string, attemptedProviders: string[] = []) {
    super(message);
    this.name = 'AiGlobalTimeoutError';
    this.attemptedProviders = attemptedProviders;
  }
}

export type AiQuarantinedProvider = {
  name: string;
  retryInMs: number;
};

export class AiProvidersQuarantinedError extends Error {
  readonly providers: AiQuarantinedProvider[];

  constructor(providers: AiQuarantinedProvider[], message = 'All configured providers are quarantined') {
    super(message);
    this.name = 'AiProvidersQuarantinedError';
    this.providers = providers;
  }
}
=======
/**
 * Raised when the overall request budget is exhausted, so the failure can be
 * attributed to the ceiling rather than to whichever provider happened to be
 * in flight. `attempts` carries the adapter names the router actually tried,
 * recorded structurally, so a caller can map this cleanly onto a 504. `failures`
 * keeps the per-attempt descriptions the aggregate error used to carry, so the
 * typed error is not a downgrade in diagnosability.
 */
export class AiGlobalTimeoutError extends Error {
  readonly timeoutMs: number;
  readonly attempts: string[];
  readonly failures: string[];

  constructor(timeoutMs: number, attempts: string[] = [], failures: string[] = []) {
    super(
      attempts.length
        ? `Global request timeout (${timeoutMs}ms) after attempting: ${attempts.join(', ')}`
        : `Global request timeout (${timeoutMs}ms)`,
    );
    this.name = 'AiGlobalTimeoutError';
    this.timeoutMs = timeoutMs;
    this.attempts = [...attempts];
    this.failures = [...failures];
    Object.setPrototypeOf(this, AiGlobalTimeoutError.prototype);
  }
}

/**
 * Raised when an adapter aborts internally (e.g., its own AbortSignal) rather
 * than the caller explicitly cancelling the request.
 */
export class AiProviderInternalAbortError extends Error {
  readonly providerName: string;

  constructor(providerName: string, cause?: unknown) {
    const message = (cause as { message?: string } | null)?.message;
    super(
      message
        ? `${providerName} aborted internally: ${message}`
        : `${providerName} aborted internally`,
    );
    this.name = 'AiProviderInternalAbortError';
    this.providerName = providerName;
    // maintain prototype for instanceof in TS/ESM
    Object.setPrototypeOf(this, AiProviderInternalAbortError.prototype);
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
    Object.setPrototypeOf(this, AiProvidersQuarantinedError.prototype);
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
>>>>>>> 324233b (fix(testing): resolve event loop promise leaks and update schema test paths)
