import { Injectable, Logger, NotFoundException } from '@nestjs/common';
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
    slug: 'cosmic-origins',
    title: 'Cosmic Origins: Deep Field',
    genre: 'Documentary',
    synopsis:
      'An immersive scientific exploration traversing the earliest infrared light captured by deep space observatories.',
    release_year: 2024,
    rating: 'TV-G',
    poster_url: 'https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=800',
    backdrop_url: 'https://images.unsplash.com/photo-1446776811953-b23d57bd21aa?w=1200',
    license_info: 'NASA / ESA / Public Domain Data',
    is_active: true,
    episode_count: 1,
    episodes: [
      {
        id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb3',
        program_id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2',
        program_title: 'Cosmic Origins: Deep Field',
        program_slug: 'cosmic-origins',
        season_number: 1,
        episode_number: 1,
        title: 'Deep Field Epochs',
        summary:
          'Spectrographs decode photons that journeyed 13.4 billion years through expanding spacetime.',
        duration_ms: 840000,
        video_stream_url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4',
        thumbnail_url: 'https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=600',
        intro_end_ms: 20000,
        credits_start_ms: 800000,
        default_bucket_sec: 15,
        is_published: true,
        prev_episode_id: null,
        next_episode_id: null,
      },
    ],
  },
  {
    id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3',
    slug: 'the-midnight-cipher',
    title: 'The Midnight Cipher',
    genre: 'Mystery',
    synopsis:
      'A Cold War investigative thriller set in 1961 Rotterdam, where an acoustic analyst intercepts coded shortwave broadcasts.',
    release_year: 2023,
    rating: 'TV-MA',
    poster_url: 'https://images.unsplash.com/photo-1509198397868-475647b2a1e5?w=800',
    backdrop_url: 'https://images.unsplash.com/photo-1517420704952-d9f39e95b43e?w=1200',
    license_info: 'CC-BY-SA 4.0 / Public Domain Assets',
    is_active: true,
    episode_count: 1,
    episodes: [
      {
        id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb4',
        program_id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3',
        program_title: 'The Midnight Cipher',
        program_slug: 'the-midnight-cipher',
        season_number: 1,
        episode_number: 1,
        title: 'Shadows on the Maas',
        summary:
          'A mysterious numbers broadcast on frequency 4625 kHz correlates with shipping movements in the Rotterdam harbor.',
        duration_ms: 900000,
        video_stream_url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4',
        thumbnail_url: 'https://images.unsplash.com/photo-1509198397868-475647b2a1e5?w=600',
        intro_end_ms: 40000,
        credits_start_ms: 860000,
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

  async listPrograms(query: GetProgramsQueryDto): Promise<ProgramSummary[]> {
    const client = this.supabaseService.getClient();
    const limit = query.limit ?? 20;
    const offset = query.offset ?? 0;
    const ascending = query.order !== 'desc';

    if (client) {
      try {
        const { data, error } = await this.supabaseService.executeWithRetry(async () => {
          let qb = client
            .from('programs')
            .select('id, slug, title, genre, synopsis, release_year, rating, poster_url, backdrop_url, license_info, is_active')
            .eq('is_active', true)
            .order('title', { ascending })
            .range(offset, offset + limit - 1);

          if (query.genre) {
            const cleanGenre = query.genre.trim().replace(/[%,]/g, '');
            qb = qb.ilike('genre', `%${cleanGenre}%`);
          }

          if (query.q) {
            const cleanQ = query.q.trim().replace(/[%,]/g, '');
            qb = qb.or(`title.ilike.%${cleanQ}%,synopsis.ilike.%${cleanQ}%`);
          }

          return qb;
        });

        if (!error && data && data.length > 0) {
          return data as ProgramSummary[];
        }
        if (error) {
          this.logger.warn(`Database program list query failed: ${error.message}. Using fallback catalog.`);
        }
      } catch (err: any) {
        this.logger.warn(`Error querying database programs: ${err?.message}. Using fallback catalog.`);
      }
    }

    // In-memory canonical catalog fallback
    let result = FALLBACK_PROGRAMS.filter((p) => p.is_active);

    if (query.genre) {
      const g = query.genre.toLowerCase().trim();
      result = result.filter((p) => p.genre.toLowerCase().includes(g));
    }

    if (query.q) {
      const q = query.q.toLowerCase().trim();
      result = result.filter(
        (p) => p.title.toLowerCase().includes(q) || p.synopsis.toLowerCase().includes(q),
      );
    }

    result.sort((a, b) => (ascending ? a.title.localeCompare(b.title) : b.title.localeCompare(a.title)));

    return result.slice(offset, offset + limit).map(({ episodes, ...rest }) => ({
      ...rest,
      episode_count: episodes.length,
    }));
  }

  async getProgramBySlug(slug: string): Promise<ProgramWithEpisodes> {
    const cleanSlug = slug.trim().toLowerCase();
    const client = this.supabaseService.getClient();

    if (client) {
      try {
        const { data: program, error: progError } = await this.supabaseService.executeWithRetry(async () =>
          client
            .from('programs')
            .select('id, slug, title, genre, synopsis, release_year, rating, poster_url, backdrop_url, license_info, is_active')
            .eq('slug', cleanSlug)
            .eq('is_active', true)
            .single(),
        );

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

          if (!epError) {
            const epList = (episodes || []) as EpisodeDetails[];
            // Link prev and next episode pointers
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
        this.logger.warn(`Database query for slug ${cleanSlug} failed: ${err?.message}. Using fallback catalog.`);
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
    const client = this.supabaseService.getClient();

    if (client) {
      try {
        const { data, error } = await this.supabaseService.executeWithRetry(async () =>
          client
            .from('episodes')
            .select(
              'id, program_id, season_number, episode_number, title, summary, duration_ms, video_stream_url, thumbnail_url, intro_end_ms, credits_start_ms, default_bucket_sec, is_published',
            )
            .eq('id', episodeId)
            .eq('is_published', true)
            .single(),
        );

        if (data && !error) {
          // Fetch program title and sibling episodes for next/prev navigation
          const { data: siblings } = await client
            .from('episodes')
            .select('id, season_number, episode_number')
            .eq('program_id', data.program_id)
            .eq('is_published', true)
            .order('season_number', { ascending: true })
            .order('episode_number', { ascending: true });

          let prevId: string | null = null;
          let nextId: string | null = null;
          if (siblings && siblings.length > 0) {
            const idx = siblings.findIndex((s) => s.id === data.id);
            if (idx > 0) prevId = siblings[idx - 1].id;
            if (idx >= 0 && idx < siblings.length - 1) nextId = siblings[idx + 1].id;
          }

          return {
            ...(data as EpisodeDetails),
            prev_episode_id: prevId,
            next_episode_id: nextId,
          };
        }
      } catch (err: any) {
        this.logger.warn(`Database query for episode ${episodeId} failed: ${err?.message}. Using fallback catalog.`);
      }
    }

    for (const prog of FALLBACK_PROGRAMS) {
      const ep = prog.episodes.find((e) => e.id === episodeId && e.is_published);
      if (ep) return ep;
    }

    throw new NotFoundException(`Playable episode with ID '${episodeId}' not found`);
  }
}
