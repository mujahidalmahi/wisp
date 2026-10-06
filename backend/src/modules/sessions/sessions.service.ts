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

    const newBookmark: BookmarkedMoment = {
      id: crypto.randomUUID(),
      label: dto.label.trim(),
      playbackPositionMs: safePlaybackMs,
      aiCard: dto.aiCard || null,
      interactionId: dto.interactionId || null,
      createdAt: new Date().toISOString(),
    };

    if (this.supabaseService.isConfigured()) {
      const client = this.supabaseService.getClient();
      if (!client) {
        throw new ServiceUnavailableException('Database client unavailable');
      }

      // Check for existing session
      const { data: existingSession, error: fetchErr } = await client
        .from('conversation_sessions')
        .select('*')
        .eq('device_id', cleanDeviceId)
        .eq('episode_id', episodeId)
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

        const updatedBookmarks = [...existingBookmarks, newBookmark];

        const { data: updated, error: updateErr } = await client
          .from('conversation_sessions')
          .update({
            bookmarked_moments: updatedBookmarks,
            last_playback_position_ms: safePlaybackMs,
            updated_at: new Date().toISOString(),
            expires_at: new Date(Date.now() + 12 * 3600 * 1000).toISOString(),
          })
          .eq('id', existingSession.id)
          .select('*')
          .single();

        if (updateErr) {
          throw new ServiceUnavailableException(`Failed to append bookmark: ${updateErr.message}`);
        }

        return {
          success: true,
          bookmark: newBookmark,
          sessionId: updated.id,
          bookmarkedMoments: updatedBookmarks,
        };
      } else {
        // Create new conversation session with the initial bookmark
        const { data: created, error: insertErr } = await client
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
          })
          .select('*')
          .single();

        if (insertErr) {
          throw new ServiceUnavailableException(
            `Failed to create session with bookmark: ${insertErr.message}`,
          );
        }

        return {
          success: true,
          bookmark: newBookmark,
          sessionId: created.id,
          bookmarkedMoments: [newBookmark],
        };
      }
    }

    // In-memory fallback
    const key = this.sessionKey(cleanDeviceId, episodeId);
    let session = this.inMemorySessions.get(key);
    if (!session || new Date(session.expiresAt).getTime() <= Date.now()) {
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
      session.bookmarkedMoments.push(newBookmark);
      session.lastPlaybackPositionMs = safePlaybackMs;
      session.updatedAt = new Date().toISOString();
      session.expiresAt = new Date(Date.now() + 12 * 3600 * 1000).toISOString();
    }

    return {
      success: true,
      bookmark: newBookmark,
      sessionId: session.id,
      bookmarkedMoments: session.bookmarkedMoments,
    };
  }
}
