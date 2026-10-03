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
    this.name = 'AiProviderCallerAbortError';
    this.providerName = providerName;
  }
}

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
