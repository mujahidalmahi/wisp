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

export function isAbortLikeError(err: unknown): boolean {
  const name = (err as { name?: string } | null)?.name;
  return name === 'AbortError' || name === 'TimeoutError';
}

function truncateBody(body: string): string {
  const trimmed = (body || '').trim();
  return trimmed.length > 240 ? `${trimmed.slice(0, 240)}...` : trimmed;
}