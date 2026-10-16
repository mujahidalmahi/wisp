import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { GetProgramsQueryDto } from './dto/get-programs-query.dto';

export interface ProgramSummary {
  id: string;
  slug: string;
  title: string;
  genre: string;
  synopsis: string;
  release_year?: number;
  rating: string;
  poster_url?: string;
  backdrop_url?: string;
  license_info: string;
  is_active: boolean;
  episode_count?: number;
}

export interface EpisodeDetails {
  id: string;
  program_id: string;
  program_title?: string;
  program_slug?: string;
  season_number: number;
  episode_number: number;
  title: string;
  summary: string;
  duration_ms: number;
  video_stream_url: string;
  thumbnail_url?: string;
  intro_end_ms?: number;
  credits_start_ms?: number;
  default_bucket_sec?: number;
  is_published: boolean;
  prev_episode_id?: string | null;
  next_episode_id?: string | null;
}

export interface ProgramWithEpisodes extends ProgramSummary {
  episodes: EpisodeDetails[];
}

export interface PaginatedPrograms {
  items: ProgramSummary[];
  pagination: {
    limit: number;
    next_cursor: string | null;
    has_more: boolean;
  };
}

export const FALLBACK_PROGRAMS: ProgramWithEpisodes[] = [
  {
    id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1',
    slug: 'tears-of-steel',
    title: 'Tears of Steel',
    genre: 'Sci-Fi',
    synopsis:
      'Set in a dystopian future Amsterdam, a group of scientists and soldiers attempt to stage a desperate temporal calibration to undo a cybernetic cataclysm.',
    release_year: 2012,
    rating: 'TV-14',
    poster_url: 'https://images.unsplash.com/photo-1534447677768-be436bb09401?w=800',
    backdrop_url: 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=1200',
    license_info: 'CC-BY Blender Foundation (Public Domain Archive)',
    is_active: true,
    episode_count: 2,
    episodes: [
      {
        id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1',
        program_id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1',
        program_title: 'Tears of Steel',
        program_slug: 'tears-of-steel',
        season_number: 1,
        episode_number: 1,
        title: 'The Amsterdam Calibration',
        summary:
          'Thom, Celia, and their crew gather atop the Oude Kerk watchtower to align the temporal beacon before the biomechanical drones breach their perimeter.',
        duration_ms: 734000,
        video_stream_url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/TearsOfSteel.mp4',
        thumbnail_url: 'https://images.unsplash.com/photo-1509198397868-475647b2a1e5?w=600',
        intro_end_ms: 45000,
        credits_start_ms: 690000,
        default_bucket_sec: 15,
        is_published: true,
        prev_episode_id: null,
        next_episode_id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb2',
      },
      {
        id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb2',
        program_id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1',
        program_title: 'Tears of Steel',
        program_slug: 'tears-of-steel',
        season_number: 1,
        episode_number: 2,
        title: 'The Signal Protocol',
        summary:
          'Following the beacon activation, residue signals reveal an anomaly in Celia’s cybernetic prosthetic hand that threatens the stability of the bridge node.',
        duration_ms: 712000,
        video_stream_url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4',
        thumbnail_url: 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=600',
        intro_end_ms: 30000,
        credits_start_ms: 670000,
        default_bucket_sec: 15,
        is_published: true,
        prev_episode_id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1',
        next_episode_id: null,
      },
    ],
  },
  {
    id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2',
    slug: 'sintel',
    title: 'Sintel',
    genre: 'Fantasy / Action',
    synopsis:
      'A solitary young woman roams a snow-swept wasteland seeking Scales, a diminutive dragon she nurtured from injury before a predator snatched him away.',
    release_year: 2010,
    rating: 'TV-PG',
    poster_url: 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=800',
    backdrop_url: 'https://images.unsplash.com/photo-1534447677768-be436bb09401?w=1200',
    license_info: 'CC-BY Blender Foundation',
    is_active: true,
    episode_count: 1,
    episodes: [
      {
        id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb3',
        program_id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2',
        program_title: 'Sintel',
        program_slug: 'sintel',
        season_number: 1,
        episode_number: 1,
        title: 'The Dragon’s Valley',
        summary:
          'Sintel reaches the treacherous cavern at the apex of the volcano, confronting a monstrous adult dragon that guards a tragic, irreversible secret.',
        duration_ms: 888000,
        video_stream_url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/Sintel.mp4',
        thumbnail_url: 'https://images.unsplash.com/photo-1534447677768-be436bb09401?w=600',
        intro_end_ms: 24000,
        credits_start_ms: 810000,
        default_bucket_sec: 15,
        is_published: true,
        prev_episode_id: null,
        next_episode_id: null,
      },
    ],
  },
  {
    id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3',
    slug: 'cosmos-laundromat',
    title: 'Cosmos Laundromat',
    genre: 'Surreal / Drama',
    synopsis:
      'On a desolate island, a despondent sheep named Franck meets an eccentric salesman named Victor, who offers him the gift of infinite synthetic lifetimes.',
    release_year: 2015,
    rating: 'TV-MA',
    poster_url: 'https://images.unsplash.com/photo-1509198397868-475647b2a1e5?w=800',
    backdrop_url: 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=1200',
    license_info: 'CC-BY Blender Foundation',
    is_active: true,
    episode_count: 1,
    episodes: [
      {
        id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb4',
        program_id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3',
        program_title: 'Cosmos Laundromat',
        program_slug: 'cosmos-laundromat',
        season_number: 1,
        episode_number: 1,
        title: 'First Cycle: On Foreign Ground',
        summary:
          'Franck enters Victor’s temporal spinning capsule and awakens transformed on an alien, pastel-hued shoreline populated by enigmatic avian observers.',
        duration_ms: 720000,
        video_stream_url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/CosmosLaundromat.mp4',
        thumbnail_url: 'https://images.unsplash.com/photo-1509198397868-475647b2a1e5?w=600',
        intro_end_ms: 35000,
        credits_start_ms: 660000,
        default_bucket_sec: 15,
        is_published: true,
        prev_episode_id: null,
        next_episode_id: null,
      },
    ],
  },
];

@Injectable()
export class CatalogService {
  private readonly logger = new Logger(CatalogService.name);

  constructor(private readonly supabaseService: SupabaseService) {}

  private encodeCursor(title: string, id: string): string {
    return Buffer.from(JSON.stringify({ title, id })).toString('base64url');
  }

  private decodeCursor(cursor: string): { title: string; id: string } | null {
    try {
      if (typeof cursor !== 'string' || cursor.length === 0 || cursor.length > 512) {
        return null;
      }
      const decoded = Buffer.from(cursor, 'base64url').toString('utf-8');
      const parsed = JSON.parse(decoded);
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (
        !parsed ||
        typeof parsed.title !== 'string' ||
        typeof parsed.id !== 'string' ||
        !uuidRegex.test(parsed.id)
      ) {
        return null;
      }
      // Strict token validation: Disallow any PostgREST grammar delimiters, injection characters, backslashes, newlines, or control characters
      if (/["(),;\\\[\]<>{}\r\n\t\x00-\x1F\x7F]/.test(parsed.title)) {
        return null;
      }
      const safeTitle = parsed.title.trim();
      if (safeTitle.length === 0 || safeTitle.length > 200) {
        return null;
      }
      return { title: safeTitle, id: parsed.id };
    } catch {
      return null;
    }
  }

  async listPrograms(query: GetProgramsQueryDto): Promise<PaginatedPrograms> {
    const limit = query.limit ?? 20;
    const ascending = query.order !== 'desc';
    const isConfigured = this.supabaseService.isConfigured();
    const isProduction = process.env.NODE_ENV === 'production';
    const allowDemoFallback = !isConfigured || (!isProduction && process.env.ENABLE_DEMO_FALLBACK === 'true');

    // Validate cursor if provided and reject invalid cursors with 400 Bad Request
    let cursorData: { title: string; id: string } | null = null;
    if (query.cursor) {
      cursorData = this.decodeCursor(query.cursor);
      if (!cursorData) {
        throw new BadRequestException(
          'Invalid pagination cursor: cursor must be a valid base64url token with valid title and UUID',
        );
      }
    }

    // 1. Production Database Path (when Supabase is configured)
    if (isConfigured) {
      const client = this.supabaseService.getClient()!;
      try {
        if (typeof client.rpc !== 'function') {
          throw new ServiceUnavailableException('Database catalog RPC get_paginated_programs is unavailable');
        }

        const { data, error } = await this.supabaseService.executeWithRetry(async () =>
          client.rpc('get_paginated_programs', {
            p_limit: limit + 1,
            p_cursor_title: cursorData ? cursorData.title : null,
            p_cursor_id: cursorData ? cursorData.id : null,
            p_ascending: ascending,
            p_genre: query.genre?.trim() || null,
            p_query: query.q?.trim() || null,
          }),
        );

        if (error) {
          this.logger.error(`Database program query failed: ${error.message}`);
          if (!allowDemoFallback) {
            throw new ServiceUnavailableException(`Database catalog unavailable: ${error.message}`);
          }
        } else {
          const rawItems = (data || []) as ProgramSummary[];
          const hasMore = rawItems.length > limit;
          const items = hasMore ? rawItems.slice(0, limit) : rawItems;
          const nextCursor =
            hasMore && items.length > 0
              ? this.encodeCursor(items[items.length - 1].title, items[items.length - 1].id)
              : null;

          return {
            items,
            pagination: {
              limit,
              next_cursor: nextCursor,
              has_more: hasMore,
            },
          };
        }
      } catch (err: any) {
        if (err instanceof ServiceUnavailableException) throw err;
        this.logger.error(`Error querying database catalog: ${err?.message}`);
        if (!allowDemoFallback) {
          throw new ServiceUnavailableException('Database catalog unavailable');
        }
      }
    }

    // 2. Resilient In-Memory Fallback Path (only for standalone / unconfigured mode)
    let filtered = FALLBACK_PROGRAMS.filter((p) => p.is_active);

    if (query.genre) {
      const g = query.genre.toLowerCase().trim();
      filtered = filtered.filter((p) => p.genre.toLowerCase().includes(g));
    }

    if (query.q) {
      const cleanQ = query.q.replace(/[^a-zA-Z0-9\s]/g, ' ').replace(/\s+/g, ' ').toLowerCase().trim();
      if (cleanQ) {
        filtered = filtered.filter(
          (p) =>
            p.title.toLowerCase().includes(cleanQ) ||
            p.synopsis.toLowerCase().includes(cleanQ),
        );
      }
    }

    filtered.sort((a, b) => {
      const cmp = a.title.localeCompare(b.title);
      if (cmp !== 0) return ascending ? cmp : -cmp;
      return ascending ? a.id.localeCompare(b.id) : b.id.localeCompare(a.id);
    });

    // Stable cursor filtering in fallback
    if (cursorData) {
      const idx = filtered.findIndex((p) =>
        ascending
          ? p.title.localeCompare(cursorData!.title) > 0 ||
            (p.title === cursorData!.title && p.id > cursorData!.id)
          : p.title.localeCompare(cursorData!.title) < 0 ||
            (p.title === cursorData!.title && p.id < cursorData!.id),
      );
      filtered = idx >= 0 ? filtered.slice(idx) : [];
    }

    const hasMore = filtered.length > limit;
    const pageItems = hasMore ? filtered.slice(0, limit) : filtered;
    const items = pageItems.map(({ episodes, ...rest }) => ({
      ...rest,
      episode_count: episodes.length,
    }));

    const nextCursor =
      hasMore && items.length > 0
        ? this.encodeCursor(items[items.length - 1].title, items[items.length - 1].id)
        : null;

    return {
      items,
      pagination: {
        limit,
        next_cursor: nextCursor,
        has_more: hasMore,
      },
    };
  }

  async getProgramBySlug(slug: string): Promise<ProgramWithEpisodes> {
    const cleanSlug = slug.trim().toLowerCase();
    const isConfigured = this.supabaseService.isConfigured();
    const isProduction = process.env.NODE_ENV === 'production';
    const allowDemoFallback = !isConfigured || (!isProduction && process.env.ENABLE_DEMO_FALLBACK === 'true');

    if (isConfigured) {
      const client = this.supabaseService.getClient()!;
      try {
        const { data: program, error: progError } = await this.supabaseService.executeWithRetry(async () =>
          client
            .from('programs')
            .select(
              'id, slug, title, genre, synopsis, release_year, rating, poster_url, backdrop_url, license_info, is_active',
            )
            .eq('slug', cleanSlug)
            .eq('is_active', true)
            .single(),
        );

        if (progError) {
          if (progError.code === 'PGRST116') {
            // Explicit Not Found in production database (Item 5)
            throw new NotFoundException(`Program with slug '${cleanSlug}' not found`);
          }
          this.logger.error(`Database query for slug ${cleanSlug} failed: ${progError.message}`);
          if (!allowDemoFallback) {
            throw new ServiceUnavailableException(`Database catalog unavailable: ${progError.message}`);
          }
        }

        if (program && !progError) {
          const { data: episodes, error: epError } = await this.supabaseService.executeWithRetry(async () =>
            client
              .from('episodes')
              .select(
                'id, program_id, season_number, episode_number, title, summary, duration_ms, video_stream_url, thumbnail_url, intro_end_ms, credits_start_ms, default_bucket_sec, is_published',
              )
              .eq('program_id', program.id)
              .eq('is_published', true)
              .order('season_number', { ascending: true })
              .order('episode_number', { ascending: true }),
          );

          if (epError) {
            this.logger.error(`Failed to fetch episodes for program ${program.id}: ${epError.message}`);
            if (!allowDemoFallback) {
              throw new ServiceUnavailableException(`Database catalog unavailable: ${epError.message}`);
            }
          } else if (episodes) {
            const epList = episodes as EpisodeDetails[];
            const enriched = epList.map((ep, idx) => ({
              ...ep,
              program_title: program.title,
              program_slug: program.slug,
              prev_episode_id: idx > 0 ? epList[idx - 1].id : null,
              next_episode_id: idx < epList.length - 1 ? epList[idx + 1].id : null,
            }));

            return {
              ...(program as ProgramSummary),
              episode_count: enriched.length,
              episodes: enriched,
            };
          }
        }
      } catch (err: any) {
        if (err instanceof NotFoundException || err instanceof ServiceUnavailableException) throw err;
        this.logger.error(`Database query for slug ${cleanSlug} failed: ${err?.message}`);
        if (!allowDemoFallback) {
          throw new ServiceUnavailableException('Database catalog unavailable');
        }
      }
    }

    const found = FALLBACK_PROGRAMS.find((p) => p.slug === cleanSlug && p.is_active);
    if (!found) {
      throw new NotFoundException(`Program with slug '${cleanSlug}' not found`);
    }

    return {
      ...found,
      episodes: found.episodes.filter((e) => e.is_published),
    };
  }

  async getEpisodeById(episodeId: string): Promise<EpisodeDetails> {
    const isConfigured = this.supabaseService.isConfigured();
    const isProduction = process.env.NODE_ENV === 'production';
    const allowDemoFallback = !isConfigured || (!isProduction && process.env.ENABLE_DEMO_FALLBACK === 'true');

    if (isConfigured) {
      const client = this.supabaseService.getClient()!;
      try {
        // Query episode with joined program metadata (Item 9)
        const { data, error } = await this.supabaseService.executeWithRetry(async () =>
          client
            .from('episodes')
            .select(
              'id, program_id, season_number, episode_number, title, summary, duration_ms, video_stream_url, thumbnail_url, intro_end_ms, credits_start_ms, default_bucket_sec, is_published, programs(title, slug)',
            )
            .eq('id', episodeId)
            .eq('is_published', true)
            .single(),
        );

        if (error) {
          if (error.code === 'PGRST116' || error.code === '22P02') {
            // Explicit Not Found in production database (Item 5)
            throw new NotFoundException(`Playable episode with ID '${episodeId}' not found`);
          }
          this.logger.error(`Database episode query failed: ${error.message}`);
          if (!allowDemoFallback) {
            throw new ServiceUnavailableException(`Database catalog unavailable: ${error.message}`);
          }
        }

        if (data && !error) {
          const raw = data as any;
          const programsObj = Array.isArray(raw.programs) ? raw.programs[0] : raw.programs;
          const programTitle = programsObj?.title || raw.program_title;
          const programSlug = programsObj?.slug || raw.program_slug;

          // Sibling lookup with retry policy (Item 10)
          const { data: siblings } = await this.supabaseService.executeWithRetry(async () =>
            client
              .from('episodes')
              .select('id, season_number, episode_number')
              .eq('program_id', raw.program_id)
              .eq('is_published', true)
              .order('season_number', { ascending: true })
              .order('episode_number', { ascending: true }),
          );

          let prevId: string | null = null;
          let nextId: string | null = null;
          if (siblings && siblings.length > 0) {
            const idx = siblings.findIndex((s: any) => s.id === raw.id);
            if (idx > 0) prevId = siblings[idx - 1].id;
            if (idx >= 0 && idx < siblings.length - 1) nextId = siblings[idx + 1].id;
          }

          const { programs: _, ...rest } = raw;
          return {
            ...rest,
            program_title: programTitle,
            program_slug: programSlug,
            prev_episode_id: prevId,
            next_episode_id: nextId,
          };
        }
      } catch (err: any) {
        if (err instanceof NotFoundException || err instanceof ServiceUnavailableException) throw err;
        this.logger.error(`Database episode query failed: ${err?.message}`);
        if (!allowDemoFallback) {
          throw new ServiceUnavailableException('Database catalog unavailable');
        }
      }
    }

    // In-memory fallback
    for (const prog of FALLBACK_PROGRAMS) {
      const ep = prog.episodes.find((e) => e.id === episodeId && e.is_published);
      if (ep) {
        return {
          ...ep,
          program_title: ep.program_title || prog.title,
          program_slug: ep.program_slug || prog.slug,
        };
      }
    }

    throw new NotFoundException(`Playable episode with ID '${episodeId}' not found`);
  }
}
