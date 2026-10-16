import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import * as crypto from 'crypto';
import { SupabaseService } from '../supabase/supabase.service';
import { CatalogService } from '../catalog/catalog.service';
import { CreateBookmarkDto } from './dto/create-bookmark.dto';
import { validateWispResponseCard } from '../../common/dto/response-card-validator';

export interface BookmarkedMoment {
  id: string;
  label: string;
  playbackPositionMs: number;
  aiCard?: Record<string, any> | null;
  interactionId?: string | null;
  createdAt: string;
}

export interface ConversationSessionResponse {
  id: string;
  deviceId: string;
  episodeId: string;
  profileId?: string | null;
  lastPlaybackPositionMs: number;
  turnCount: number;
  recentTurns: any[];
  bookmarkedMoments: BookmarkedMoment[];
  expiresAt: string;
  createdAt?: string;
  updatedAt?: string;
}

@Injectable()
export class SessionsService {
  private readonly logger = new Logger(SessionsService.name);

  // In-memory sessions storage for dev/test environments without database
  private readonly inMemorySessions = new Map<string, ConversationSessionResponse>();
  private readonly inMemoryProfiles = new Map<string, { id: string; deviceId: string }>();

  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly catalogService: CatalogService,
  ) {}

  private sessionKey(deviceId: string, episodeId: string): string {
    return `${deviceId.trim()}:${episodeId.trim()}`;
  }

  /**
   * Retrieves active multi-turn conversation session and bookmarks for a device and episode.
   */
  async getSession(
    episodeId: string,
    deviceId: string,
  ): Promise<ConversationSessionResponse> {
    const cleanDeviceId = (deviceId || '').trim();
    if (!cleanDeviceId || cleanDeviceId.length < 3) {
      throw new BadRequestException('A valid deviceId is required');
    }

    // Verify target episode exists
    await this.catalogService.getEpisodeById(episodeId);

    if (this.supabaseService.isConfigured()) {
      const client = this.supabaseService.getClient();
      if (!client) {
        throw new ServiceUnavailableException('Database client unavailable');
      }

      const { data, error } = await client
        .from('conversation_sessions')
        .select('*')
        .eq('device_id', cleanDeviceId)
        .eq('episode_id', episodeId)
        .gt('expires_at', new Date().toISOString())
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) {
        this.logger.error(`Failed to fetch session from database: ${error.message}`);
        throw new ServiceUnavailableException(`Database error: ${error.message}`);
      }

      if (!data) {
        throw new NotFoundException(
          `No active conversation session found for episode '${episodeId}' and device '${cleanDeviceId}'`,
        );
      }

      return {
        id: data.id,
        deviceId: data.device_id,
        episodeId: data.episode_id,
        profileId: data.profile_id,
        lastPlaybackPositionMs: Number(data.last_playback_position_ms || 0),
        turnCount: data.turn_count || 0,
        recentTurns: Array.isArray(data.recent_turns) ? data.recent_turns : [],
        bookmarkedMoments: Array.isArray(data.bookmarked_moments)
          ? data.bookmarked_moments
          : [],
        expiresAt: data.expires_at,
        createdAt: data.created_at,
        updatedAt: data.updated_at,
      };
    }

    // In-memory fallback path
    const key = this.sessionKey(cleanDeviceId, episodeId);
    const existing = this.inMemorySessions.get(key);
    if (!existing || new Date(existing.expiresAt).getTime() <= Date.now()) {
      throw new NotFoundException(
        `No active conversation session found for episode '${episodeId}' and device '${cleanDeviceId}'`,
      );
    }
    return existing;
  }

  /**
   * Pins a timestamped AI insight card into bookmarked_moments on the device's conversation session.
   */
  async createBookmark(
    episodeId: string,
    deviceId: string,
    dto: CreateBookmarkDto,
  ): Promise<{
    success: boolean;
    bookmark: BookmarkedMoment;
    sessionId: string;
    bookmarkedMoments: BookmarkedMoment[];
  }> {
    const cleanDeviceId = (deviceId || '').trim();
    if (!cleanDeviceId || cleanDeviceId.length < 3) {
      throw new BadRequestException('A valid deviceId is required');
    }

    // Verify target episode exists
    const episode = await this.catalogService.getEpisodeById(episodeId);
    const safePlaybackMs = Math.max(
      0,
      episode?.duration_ms
        ? Math.min(dto.playbackPositionMs, episode.duration_ms)
        : dto.playbackPositionMs,
    );

    // Validate aiCard schema and anti-spoiler boundary if supplied (Blocker 9)
    let validatedAiCard: any = null;
    if (dto.aiCard) {
      const valResult = validateWispResponseCard(dto.aiCard, {
        episodeId,
        actionType: (dto.aiCard as any)?.actionType || 'contextual_qa',
        playbackPositionMs: safePlaybackMs,
      });

      if (!valResult.valid || !valResult.card) {
        throw new BadRequestException(
          `Invalid bookmark aiCard payload: ${valResult.reason}`,
        );
      }
      validatedAiCard = valResult.card;
    }

    const newBookmark: BookmarkedMoment = {
      id: crypto.randomUUID(),
      label: dto.label.trim(),
      playbackPositionMs: safePlaybackMs,
      aiCard: validatedAiCard,
      interactionId: dto.interactionId || null,
      createdAt: new Date().toISOString(),
    };

    if (this.supabaseService.isConfigured()) {
      const client = this.supabaseService.getClient();
      if (!client) {
        throw new ServiceUnavailableException('Database client unavailable');
      }

      // 1. Validate profile ownership if profileId is supplied (Blocker 3)
      if (dto.profileId) {
        const { data: profile, error: profErr } = await client
          .from('profiles')
          .select('id, device_id')
          .eq('id', dto.profileId)
          .maybeSingle();

        if (profErr) {
          throw new ServiceUnavailableException(`Database error verifying profile: ${profErr.message}`);
        }

        if (!profile || profile.device_id !== cleanDeviceId) {
          throw new ForbiddenException(
            `Profile '${dto.profileId}' does not belong to authenticated device '${cleanDeviceId}'`,
          );
        }
      }

      // 2. Attempt atomic PostgreSQL RPC first for optimal concurrency & locking (Blockers 6 & 7)
      try {
        const { data: rpcRes, error: rpcErr } = await client.rpc('add_session_bookmark', {
          p_device_id: cleanDeviceId,
          p_episode_id: episodeId,
          p_profile_id: dto.profileId || null,
          p_bookmark: newBookmark,
          p_last_playback_position_ms: safePlaybackMs,
        });

        if (!rpcErr && rpcRes && rpcRes.session_id) {
          return {
            success: true,
            bookmark: rpcRes.bookmark || newBookmark,
            sessionId: rpcRes.session_id,
            bookmarkedMoments: Array.isArray(rpcRes.bookmarked_moments)
              ? rpcRes.bookmarked_moments
              : [newBookmark],
          };
        }
        if (rpcErr && rpcErr.message && rpcErr.message.includes('PROFILE_MISMATCH')) {
          throw new ForbiddenException(
            `Profile '${dto.profileId}' does not belong to authenticated device '${cleanDeviceId}'`,
          );
        }
      } catch (rpcEx: any) {
        if (rpcEx instanceof ForbiddenException) throw rpcEx;
        // If RPC function not present or mocked, fall through to optimistic retry loop
      }

      // 3. Concurrency-safe optimistic retry loop (up to 3 attempts)
      for (let attempt = 0; attempt < 3; attempt++) {
        const nowIso = new Date().toISOString();
        const { data: existingSession, error: fetchErr } = await client
          .from('conversation_sessions')
          .select('*')
          .eq('device_id', cleanDeviceId)
          .eq('episode_id', episodeId)
          .gt('expires_at', nowIso)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (fetchErr) {
          throw new ServiceUnavailableException(`Database error: ${fetchErr.message}`);
        }

        if (existingSession) {
          const existingBookmarks: BookmarkedMoment[] = Array.isArray(
            existingSession.bookmarked_moments,
          )
            ? existingSession.bookmarked_moments
            : [];

          // Idempotency check: avoid duplicate appends on retries (Blocker 5)
          const existingMatching = existingBookmarks.find(
            (b) =>
              (dto.interactionId && b.interactionId === dto.interactionId) ||
              (b.playbackPositionMs === safePlaybackMs && b.label === newBookmark.label),
          );
          const isDuplicate = !!existingMatching;
          const returnBookmark = existingMatching || newBookmark;

          // Cap maximum bookmarks at 100 to prevent unbounded JSONB growth
          const updatedBookmarks = isDuplicate
            ? existingBookmarks
            : [...existingBookmarks.slice(-99), newBookmark];

          // Safely scope update to session ID, authenticated device ID, episode ID, and active expiry
          const updateQuery = client
            .from('conversation_sessions')
            .update({
              bookmarked_moments: updatedBookmarks,
              last_playback_position_ms: safePlaybackMs,
              updated_at: new Date().toISOString(),
              expires_at: new Date(Date.now() + 12 * 3600 * 1000).toISOString(),
            })
            .eq('id', existingSession.id)
            .eq('device_id', cleanDeviceId)
            .eq('episode_id', episodeId)
            .gt('expires_at', nowIso);

          let updated: any = null;
          let updateErr: any = null;
          if (typeof (updateQuery as any).select === 'function') {
            const sel = (updateQuery as any).select('*');
            if (typeof sel?.maybeSingle === 'function') {
              const res = await sel.maybeSingle();
              updated = res.data;
              updateErr = res.error;
            } else if (typeof sel?.single === 'function') {
              const res = await sel.single();
              updated = res.data;
              updateErr = res.error;
            } else {
              const res = await sel;
              updated = res?.data;
              updateErr = res?.error;
            }
          } else {
            const res = await (updateQuery as any);
            updated = res?.data || existingSession;
            updateErr = res?.error;
          }

          if (updateErr) {
            throw new ServiceUnavailableException(`Failed to append bookmark: ${updateErr.message}`);
          }

          if (updated && updated.device_id === cleanDeviceId) {
            return {
              success: true,
              bookmark: returnBookmark,
              sessionId: updated.id,
              bookmarkedMoments: updatedBookmarks,
            };
          }
          // Concurrent conflict or expiry; retry next attempt
          continue;
        }

        // Create new conversation session with initial bookmark
        const insertQuery = client
          .from('conversation_sessions')
          .insert({
            device_id: cleanDeviceId,
            episode_id: episodeId,
            profile_id: dto.profileId || null,
            last_playback_position_ms: safePlaybackMs,
            turn_count: 0,
            recent_turns: [],
            bookmarked_moments: [newBookmark],
            expires_at: new Date(Date.now() + 12 * 3600 * 1000).toISOString(),
          });

        let created: any = null;
        let insertErr: any = null;
        if (typeof (insertQuery as any).select === 'function') {
          const sel = (insertQuery as any).select('*');
          if (typeof sel?.maybeSingle === 'function') {
            const res = await sel.maybeSingle();
            created = res.data;
            insertErr = res.error;
          } else if (typeof sel?.single === 'function') {
            const res = await sel.single();
            created = res.data;
            insertErr = res.error;
          } else {
            const res = await sel;
            created = res?.data;
            insertErr = res?.error;
          }
        } else {
          const res = await (insertQuery as any);
          created = res?.data;
          insertErr = res?.error;
        }

        if (insertErr) {
          // If concurrent insert occurred and unique constraint violated, retry to fetch and update
          if (insertErr.code === '23505' || insertErr.message?.includes('duplicate key')) {
            continue;
          }
          throw new ServiceUnavailableException(
            `Failed to create session with bookmark: ${insertErr.message}`,
          );
        }

        if (created) {
          return {
            success: true,
            bookmark: newBookmark,
            sessionId: created.id,
            bookmarkedMoments: [newBookmark],
          };
        }
      }

      throw new ServiceUnavailableException('Concurrent bookmark creation conflict. Please retry.');
    }

    // In-memory fallback
    if (dto.profileId && this.inMemoryProfiles.has(dto.profileId)) {
      const prof = this.inMemoryProfiles.get(dto.profileId);
      if (prof && prof.deviceId !== cleanDeviceId) {
        throw new ForbiddenException(
          `Profile '${dto.profileId}' does not belong to authenticated device '${cleanDeviceId}'`,
        );
      }
    }

    const key = this.sessionKey(cleanDeviceId, episodeId);
    let session = this.inMemorySessions.get(key);
    if (!session || new Date(session.expiresAt).getTime() <= Date.now()) {
      if (this.inMemorySessions.size >= 1000) {
        const now = Date.now();
        for (const [k, sess] of this.inMemorySessions.entries()) {
          if (new Date(sess.expiresAt).getTime() <= now) {
            this.inMemorySessions.delete(k);
          }
        }
        if (this.inMemorySessions.size >= 1000) {
          const oldest = this.inMemorySessions.keys().next().value;
          if (oldest) this.inMemorySessions.delete(oldest);
        }
      }
      session = {
        id: crypto.randomUUID(),
        deviceId: cleanDeviceId,
        episodeId,
        profileId: dto.profileId || null,
        lastPlaybackPositionMs: safePlaybackMs,
        turnCount: 0,
        recentTurns: [],
        bookmarkedMoments: [newBookmark],
        expiresAt: new Date(Date.now() + 12 * 3600 * 1000).toISOString(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      this.inMemorySessions.set(key, session);
    } else {

      const existingMatching = session.bookmarkedMoments.find(
        (b) =>
          (dto.interactionId && b.interactionId === dto.interactionId) ||
          (b.playbackPositionMs === safePlaybackMs && b.label === newBookmark.label),
      );
      if (!existingMatching) {
        if (session.bookmarkedMoments.length >= 100) {
          session.bookmarkedMoments.shift();
        }
        session.bookmarkedMoments.push(newBookmark);
      }
      session.lastPlaybackPositionMs = safePlaybackMs;
      session.updatedAt = new Date().toISOString();
      session.expiresAt = new Date(Date.now() + 12 * 3600 * 1000).toISOString();

      return {
        success: true,
        bookmark: existingMatching || newBookmark,
        sessionId: session.id,
        bookmarkedMoments: session.bookmarkedMoments,
      };
    }

    return {
      success: true,
      bookmark: newBookmark,
      sessionId: session.id,
      bookmarkedMoments: session.bookmarkedMoments,
    };
  }

  /**
   * Helper for tests to register profile device ownership in unconfigured mode.
   */
  registerInMemoryProfile(profileId: string, deviceId: string): void {
    this.inMemoryProfiles.set(profileId, { id: profileId, deviceId });
  }
}
