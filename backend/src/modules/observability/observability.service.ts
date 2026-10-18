import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { CatalogService } from '../catalog/catalog.service';

export interface DatabaseHealthAndMetrics {
  status: string;
  checked_at: string;
  catalog: {
    programs_count: number;
    episodes_count: number;
    scenes_count: number;
    transcript_segments_count: number;
    entities_count: number;
    entity_appearances_count: number;
    entity_relationships_count: number;
    episode_quizzes_count: number;
    temporal_embeddings_count: number;
    profiles_count: number;
  };
  cache_efficiency: {
    total_cached_buckets: number;
    active_cached_buckets: number;
    expired_cached_buckets: number;
    cumulative_cache_hits: number;
    estimated_latency_saved_ms: number;
  };
  ai_providers: Array<{
    provider_name: string;
    action_type: string;
    total_requests: number;
    successful_requests: number;
    failed_requests: number;
    cache_hits: number;
    failover_count: number;
    success_rate_pct: number;
    cache_hit_rate_pct: number;
    avg_latency_ms: number;
    min_latency_ms: number;
    max_latency_ms: number;
    total_tokens_consumed: number;
    last_recorded_at: string;
  }>;
  latency_percentiles: Array<{
    ai_provider: string;
    action_type: string;
    sample_size: number;
    mean_latency_ms: number;
    p50_latency_ms: number;
    p95_latency_ms: number;
    p99_latency_ms: number;
    min_latency_ms: number;
    max_latency_ms: number;
  }>;
  spoiler_safety_audit: {
    total_audit_events: number;
    blocked_future_spoilers: number;
    malformed_spoiler_metadata_events: number;
    unverified_interactions: number;
  };
}

export interface PurgeMaintenanceResult {
  purged_cache_entries: number;
  purged_conversation_sessions: number;
  purged_rate_limit_windows: number;
  executed_at: string;
}

@Injectable()
export class ObservabilityService {
  private readonly logger = new Logger(ObservabilityService.name);

  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly catalogService: CatalogService,
  ) {}

  /**
   * Retrieves unified health, catalog statistics, AI performance, latency percentiles,
   * and anti-spoiler audit totals from RPC `get_database_health_and_metrics`.
   */
  async getSummaryMetrics(): Promise<DatabaseHealthAndMetrics> {
    if (this.supabaseService.isConfigured()) {
      try {
        const { data, error } = await this.supabaseService.executeRpc<DatabaseHealthAndMetrics>(
          'get_database_health_and_metrics',
        );

        if (error) {
          this.logger.error(`Database RPC get_database_health_and_metrics error: ${error}`);
          throw new ServiceUnavailableException(`Failed to retrieve database metrics: ${error}`);
        }

        if (data) {
          return data;
        }
      } catch (err: any) {
        if (err instanceof ServiceUnavailableException) throw err;
        this.logger.error(`Observability metrics retrieval failed: ${err?.message}`);
        throw new ServiceUnavailableException('Observability telemetry unavailable');
      }
    }

    // Fallback / in-memory demo telemetry snapshot
    return {
      status: 'healthy',
      checked_at: new Date().toISOString(),
      catalog: {
        programs_count: 3,
        episodes_count: 4,
        scenes_count: 14,
        transcript_segments_count: 36,
        entities_count: 22,
        entity_appearances_count: 40,
        entity_relationships_count: 18,
        episode_quizzes_count: 6,
        temporal_embeddings_count: 14,
        profiles_count: 3,
      },
      cache_efficiency: {
        total_cached_buckets: 12,
        active_cached_buckets: 12,
        expired_cached_buckets: 0,
        cumulative_cache_hits: 28,
        estimated_latency_saved_ms: 9800,
      },
      ai_providers: [
        {
          provider_name: 'groq',
          action_type: 'contextual_qa',
          total_requests: 35,
          successful_requests: 35,
          failed_requests: 0,
          cache_hits: 14,
          failover_count: 0,
          success_rate_pct: 100.0,
          cache_hit_rate_pct: 40.0,
          avg_latency_ms: 182.4,
          min_latency_ms: 95,
          max_latency_ms: 310,
          total_tokens_consumed: 8420,
          last_recorded_at: new Date().toISOString(),
        },
        {
          provider_name: 'gemini',
          action_type: 'scene_recap',
          total_requests: 12,
          successful_requests: 12,
          failed_requests: 0,
          cache_hits: 4,
          failover_count: 0,
          success_rate_pct: 100.0,
          cache_hit_rate_pct: 33.3,
          avg_latency_ms: 412.0,
          min_latency_ms: 320,
          max_latency_ms: 590,
          total_tokens_consumed: 4190,
          last_recorded_at: new Date().toISOString(),
        },
      ],
      latency_percentiles: [
        {
          ai_provider: 'groq',
          action_type: 'contextual_qa',
          sample_size: 35,
          mean_latency_ms: 182.4,
          p50_latency_ms: 175.0,
          p95_latency_ms: 285.0,
          p99_latency_ms: 308.0,
          min_latency_ms: 95,
          max_latency_ms: 310,
        },
        {
          ai_provider: 'gemini',
          action_type: 'scene_recap',
          sample_size: 12,
          mean_latency_ms: 412.0,
          p50_latency_ms: 395.0,
          p95_latency_ms: 560.0,
          p99_latency_ms: 588.0,
          min_latency_ms: 320,
          max_latency_ms: 590,
        },
      ],
      spoiler_safety_audit: {
        total_audit_events: 4,
        blocked_future_spoilers: 4,
        malformed_spoiler_metadata_events: 0,
        unverified_interactions: 0,
      },
    };
  }

  /**
   * Retrieves content curation depth across episodes from view `v_episode_temporal_coverage`.
   */
  async getTemporalCoverage(): Promise<any[]> {
    if (this.supabaseService.isConfigured()) {
      const client = this.supabaseService.getClient();
      if (client) {
        try {
          const { data, error } = await client
            .from('v_episode_temporal_coverage')
            .select('*')
            .order('program_title', { ascending: true })
            .order('season_number', { ascending: true })
            .order('episode_number', { ascending: true });

          if (!error && data) {
            return data;
          }
          if (error) {
            this.logger.warn(`Failed to read v_episode_temporal_coverage: ${error.message}`);
          }
        } catch (err: any) {
          this.logger.warn(`Error reading v_episode_temporal_coverage: ${err?.message}`);
        }
      }
    }

    // In-memory demo coverage
    return [
      {
        program_id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1',
        program_slug: 'tears-of-steel',
        program_title: 'Tears of Steel',
        genre: 'Sci-Fi / Cyberpunk',
        episode_id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1',
        season_number: 1,
        episode_number: 1,
        episode_title: 'The Bridge of New Amsterdam',
        duration_ms: 734000,
        scene_count: 4,
        transcript_segment_count: 8,
        unique_entity_count: 6,
        plot_twist_count: 2,
        relationship_edge_count: 4,
        quiz_question_count: 1,
        semantic_embedding_count: 4,
        timeline_coverage_pct: 100.0,
      },
      {
        program_id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2',
        program_slug: 'sintel',
        program_title: 'Sintel: The Dragon Quest',
        genre: 'Fantasy / Animation',
        episode_id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb3',
        season_number: 1,
        episode_number: 1,
        episode_title: 'Winter In the Islet Lands',
        duration_ms: 888000,
        scene_count: 3,
        transcript_segment_count: 6,
        unique_entity_count: 4,
        plot_twist_count: 1,
        relationship_edge_count: 3,
        quiz_question_count: 1,
        semantic_embedding_count: 3,
        timeline_coverage_pct: 100.0,
      },
      {
        program_id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3',
        program_slug: 'cosmos-odyssey',
        program_title: 'Cosmos Odyssey: The Distant Realms',
        genre: 'Documentary / Science',
        episode_id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb4',
        season_number: 1,
        episode_number: 1,
        episode_title: 'Pillars of Star Creation',
        duration_ms: 600000,
        scene_count: 3,
        transcript_segment_count: 6,
        unique_entity_count: 3,
        plot_twist_count: 0,
        relationship_edge_count: 2,
        quiz_question_count: 1,
        semantic_embedding_count: 3,
        timeline_coverage_pct: 100.0,
      },
    ];
  }

  /**
   * Retrieves AI provider throughput, success rates, latency averages, and P50/P95/P99 percentiles.
   */
  async getProviderPerformance(): Promise<{
    performance: any[];
    latencyPercentiles: any[];
  }> {
    let performance: any[] = [];
    let latencyPercentiles: any[] = [];

    if (this.supabaseService.isConfigured()) {
      const client = this.supabaseService.getClient();
      if (client) {
        try {
          const [perfRes, percRes] = await Promise.all([
            client.from('v_ai_provider_performance').select('*'),
            client.from('v_latency_percentiles_by_provider').select('*'),
          ]);

          if (!perfRes.error && perfRes.data) {
            performance = perfRes.data;
          }
          if (!percRes.error && percRes.data) {
            latencyPercentiles = percRes.data;
          }
          if (performance.length > 0 || latencyPercentiles.length > 0) {
            return { performance, latencyPercentiles };
          }
        } catch (err: any) {
          this.logger.warn(`Error querying provider performance views: ${err?.message}`);
        }
      }
    }

    const summary = await this.getSummaryMetrics();
    return {
      performance: summary.ai_providers,
      latencyPercentiles: summary.latency_percentiles,
    };
  }

  /**
   * Retrieves scene query engagement hotspots from view `v_scene_engagement_hotspots`.
   */
  async getEngagementHotspots(): Promise<any[]> {
    if (this.supabaseService.isConfigured()) {
      const client = this.supabaseService.getClient();
      if (client) {
        try {
          const { data, error } = await client
            .from('v_scene_engagement_hotspots')
            .select('*')
            .order('total_viewer_queries', { ascending: false });

          if (!error && data) {
            return data;
          }
        } catch (err: any) {
          this.logger.warn(`Error reading v_scene_engagement_hotspots: ${err?.message}`);
        }
      }
    }

    return [
      {
        episode_id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1',
        episode_title: 'The Bridge of New Amsterdam',
        scene_index: 1,
        scene_title: 'Oude Kerk Hologram Calibration',
        start_time_ms: 0,
        end_time_ms: 180000,
        total_viewer_queries: 18,
        cached_responses: 8,
        avg_response_latency_ms: 142.5,
        net_helpful_score: 12,
      },
      {
        episode_id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb3',
        episode_title: 'Winter In the Islet Lands',
        scene_index: 2,
        scene_title: 'The Shaman Cave',
        start_time_ms: 180000,
        end_time_ms: 420000,
        total_viewer_queries: 11,
        cached_responses: 4,
        avg_response_latency_ms: 165.0,
        net_helpful_score: 9,
      },
    ];
  }

  /**
   * Executes database cache, session, and rate-limit maintenance via RPC `purge_expired_cache_and_rate_limits`.
   */
  async purgeMaintenance(): Promise<PurgeMaintenanceResult> {
    if (this.supabaseService.isConfigured()) {
      try {
        const { data, error } = await this.supabaseService.executeRpc<PurgeMaintenanceResult>(
          'purge_expired_cache_and_rate_limits',
        );

        if (error) {
          this.logger.error(`Maintenance purge RPC failed: ${error}`);
          throw new ServiceUnavailableException(`Maintenance purge failed: ${error}`);
        }

        if (data) {
          return data;
        }
      } catch (err: any) {
        if (err instanceof ServiceUnavailableException) throw err;
        this.logger.error(`Maintenance purge error: ${err?.message}`);
        throw new ServiceUnavailableException('Maintenance purge failed');
      }
    }

    // In-memory fallback
    return {
      purged_cache_entries: 0,
      purged_conversation_sessions: 0,
      purged_rate_limit_windows: 0,
      executed_at: new Date().toISOString(),
    };
  }
}
