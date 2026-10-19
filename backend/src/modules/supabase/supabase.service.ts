import { Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

@Injectable()
export class SupabaseService {
  private readonly logger = new Logger(SupabaseService.name);
  private client: SupabaseClient | null = null;

  constructor(@Optional() private readonly configService?: ConfigService) {
    const url =
      this.configService?.get<string>('SUPABASE_URL') || process.env.SUPABASE_URL;
    const key =
      this.configService?.get<string>('SUPABASE_SERVICE_ROLE_KEY') ||
      this.configService?.get<string>('SUPABASE_ANON_KEY') ||
      process.env.SUPABASE_SERVICE_ROLE_KEY ||
      process.env.SUPABASE_ANON_KEY;

    if (url && key && !url.includes('your-project-ref')) {
      this.client = createClient(url, key, {
        auth: { persistSession: false },
      });
      this.logger.log('Supabase PostgreSQL client initialized');
    } else {
      this.logger.warn(
        'SUPABASE_URL or key not configured; Temporal Context Engine will use embedded seed fallback until connected.',
      );
    }
  }

  getClient(): SupabaseClient | null {
    return this.client;
  }
}
