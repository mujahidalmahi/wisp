import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

export interface DatabaseHealthResult {
  status: 'ok' | 'unconfigured' | 'error';
  configured: boolean;
  message?: string;
  latencyMs?: number;
  metrics?: {
    totalRpcCalls: number;
    failedRpcCalls: number;
    totalDbQueries: number;
    failedDbQueries: number;
    averageLatencyMs: number;
  };
}

export interface RetryOptions {
  maxRetries?: number;
  initialDelayMs?: number;
  backoffFactor?: number;
}

@Injectable()
export class SupabaseService {
  private readonly logger = new Logger(SupabaseService.name);
  private client: SupabaseClient | null = null;
  private readonly isConfiguredFlag: boolean;

  // Operational Telemetry Metrics
  private totalRpcCalls = 0;
  private failedRpcCalls = 0;
  private totalDbQueries = 0;
  private failedDbQueries = 0;
  private accumulatedLatencyMs = 0;
  private totalTimedOperations = 0;

  constructor(private readonly configService: ConfigService) {
    const rawUrl = this.configService.get<string>('SUPABASE_URL');
    const url = rawUrl ? rawUrl.trim() : undefined;
    const serviceRoleKey = this.configService.get<string>('SUPABASE_SERVICE_ROLE_KEY')?.trim();
    const anonKey = this.configService.get<string>('SUPABASE_ANON_KEY')?.trim();
    const isProduction = process.env.NODE_ENV === 'production';

    // In production, require the service-role key explicitly to prevent unexpected RLS blocks
    if (isProduction && !serviceRoleKey) {
      this.logger.error(
        'CRITICAL: SUPABASE_SERVICE_ROLE_KEY is required in production! Service readiness set to unconfigured.',
      );
      this.isConfiguredFlag = false;
      return;
    }

    if (!serviceRoleKey && anonKey) {
      this.logger.warn(
        'SUPABASE_SERVICE_ROLE_KEY not configured. Falling back to SUPABASE_ANON_KEY in local/development mode.',
      );
    }

    const key = serviceRoleKey || anonKey;

    if (url && key && !url.includes('your-project-ref') && url.startsWith('http')) {
      try {
        this.client = createClient(url, key, {
          auth: {
            persistSession: false,
            autoRefreshToken: false,
            detectSessionInUrl: false,
          },
          global: {
            headers: {
              'x-client-info': 'wisp-backend-nest@0.1.0',
            },
          },
        });
        this.isConfiguredFlag = true;
        this.logger.log('Supabase PostgreSQL client initialized with server credentials');
      } catch (err: any) {
        this.isConfiguredFlag = false;
        this.logger.error(`Failed to initialize Supabase client: ${err?.message}`);
      }
    } else {
      this.isConfiguredFlag = false;
      this.logger.warn(
        'SUPABASE_URL or service key not configured; Temporal Context Engine running in resilient standalone catalog mode.',
      );
    }
  }

  isConfigured(): boolean {
    return this.isConfiguredFlag && this.client !== null;
  }

  getClient(): SupabaseClient | null {
    return this.client;
  }

  /**
   * Health probe verifying live connection to PostgreSQL / Supabase
   */
  async checkHealth(): Promise<DatabaseHealthResult> {
    if (!this.client) {
      return {
        status: 'unconfigured',
        configured: false,
        message: 'Supabase client not initialized (missing SUPABASE_URL or key)',
        metrics: this.getMetricsSnapshot(),
      };
    }

    const start = Date.now();
    try {
      const { error } = await this.client
        .from('programs')
        .select('id')
        .limit(1);

      const latencyMs = Date.now() - start;
      this.recordOperation(latencyMs, !!error);

      if (error) {
        return {
          status: 'error',
          configured: true,
          message: error.message,
          latencyMs,
          metrics: this.getMetricsSnapshot(),
        };
      }

      return {
        status: 'ok',
        configured: true,
        latencyMs,
        metrics: this.getMetricsSnapshot(),
      };
    } catch (err: any) {
      const latencyMs = Date.now() - start;
      this.recordOperation(latencyMs, true);
      return {
        status: 'error',
        configured: true,
        message: err?.message || 'Database ping failed',
        latencyMs,
        metrics: this.getMetricsSnapshot(),
      };
    }
  }

  /**
   * Executes a database operation with exponential backoff and jitter for transient resilience.
   * Non-transient errors (syntax, authorization, validation, constraint violations) are never retried.
   */
  async executeWithRetry<T = any>(
    operation: () => Promise<any>,
    options: RetryOptions = {},
  ): Promise<{ data: T | null; error: any; count?: number | null }> {
    const maxRetries = options.maxRetries ?? 2;
    const initialDelayMs = options.initialDelayMs ?? 100;
    const backoffFactor = options.backoffFactor ?? 2;

    let delay = initialDelayMs;
    let lastError: any = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      const start = Date.now();
      try {
        const result = await operation();
        const latencyMs = Date.now() - start;

        if (!result.error) {
          this.recordOperation(latencyMs, false);
          return result;
        }

        lastError = result.error;
        const isTransient = this.isTransientError(result.error);
        if (!isTransient || attempt === maxRetries) {
          this.recordOperation(latencyMs, true);
          return result;
        }
      } catch (err: any) {
        const latencyMs = Date.now() - start;
        lastError = err;
        const isTransient = this.isTransientError(err);
        if (!isTransient || attempt === maxRetries) {
          this.recordOperation(latencyMs, true);
          return { data: null, error: err };
        }
      }

      const jitter = Math.random() * 50;
      await new Promise((resolve) => setTimeout(resolve, delay + jitter));
      delay *= backoffFactor;
    }

    return { data: null, error: lastError };
  }

  /**
   * Typed generic helper for executing SECURITY DEFINER PostgreSQL RPCs
   */
  async executeRpc<T = any>(
    rpcName: string,
    params: Record<string, any> = {},
  ): Promise<{ data: T | null; error: string | null }> {
    if (!this.client) {
      return { data: null, error: 'Database client not configured' };
    }

    this.totalRpcCalls++;
    const start = Date.now();

    try {
      const { data, error } = await this.client.rpc(rpcName, params);
      const latencyMs = Date.now() - start;
      this.recordOperation(latencyMs, !!error);

      if (error) {
        this.failedRpcCalls++;
        this.logger.warn(`RPC ${rpcName} failed: ${error.message} (${error.code || 'NO_CODE'})`);
        return { data: null, error: error.message };
      }
      return { data: data as T, error: null };
    } catch (err: any) {
      const latencyMs = Date.now() - start;
      this.failedRpcCalls++;
      this.recordOperation(latencyMs, true);
      this.logger.error(`RPC ${rpcName} unexpected error: ${err?.message}`);
      return { data: null, error: err?.message || 'Unexpected RPC failure' };
    }
  }

  isTransientError(error: any): boolean {
    if (!error) return false;
    const msg = (error.message || '').toLowerCase();
    const code = error.code || '';
    const status = error.status || error.statusCode || 0;

    // Explicit non-transient status codes: 400, 401, 403, 404, 409, 422
    if (status >= 400 && status < 500 && status !== 408 && status !== 429) {
      return false;
    }
    // Explicit non-transient Postgres error classes:
    // 22 (data exception / invalid uuid syntax), 23 (integrity constraint), 42 (syntax/access rule)
    if (
      code.startsWith('22') ||
      code.startsWith('23') ||
      code.startsWith('42') ||
      code === 'PGRST116' ||
      code === 'PGRST100'
    ) {
      return false;
    }

    return (
      msg.includes('network') ||
      msg.includes('timeout') ||
      msg.includes('fetch failed') ||
      msg.includes('connection reset') ||
      msg.includes('econnrefused') ||
      msg.includes('econnreset') ||
      status === 429 ||
      status === 502 ||
      status === 503 ||
      status === 504 ||
      code === '57P01' || // admin shutdown
      code === '53300' || // too many connections
      code === '40001' || // serialization failure
      code === '08006' || // connection failure
      code === '08001'    // unable to establish connection
    );
  }

  private recordOperation(latencyMs: number, failed: boolean) {
    this.totalDbQueries++;
    if (failed) this.failedDbQueries++;
    this.accumulatedLatencyMs += latencyMs;
    this.totalTimedOperations++;
  }

  private getMetricsSnapshot() {
    return {
      totalRpcCalls: this.totalRpcCalls,
      failedRpcCalls: this.failedRpcCalls,
      totalDbQueries: this.totalDbQueries,
      failedDbQueries: this.failedDbQueries,
      averageLatencyMs:
        this.totalTimedOperations > 0
          ? Math.round((this.accumulatedLatencyMs / this.totalTimedOperations) * 100) / 100
          : 0,
    };
  }
}
