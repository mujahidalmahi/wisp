import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { QuickActionChip, WispActionType, WispResponseCardDto } from '../dto/wisp-query.dto';

export const DEFAULT_FIREWALL_QUICK_ACTIONS = [
  'Explain what just happened',
  'Who is on screen?',
  'Catch me up to this moment',
];

export const DEFAULT_FIREWALL_CHIPS: QuickActionChip[] = [
  { id: 'chip-explain-scene', label: 'Explain what just happened', actionType: WispActionType.SCENE_EXPLAIN },
  { id: 'chip-who-onscreen', label: 'Who is on screen?', actionType: WispActionType.ENTITY_EXPLAIN },
  { id: 'chip-catch-up', label: 'Catch me up to this moment', actionType: WispActionType.EPISODE_RECAP },
];

function inferActionType(label: string): WispActionType {
  const l = (label || '').toLowerCase();
  if (l.includes('who') || l.includes('character') || l.includes('actor') || l.includes('entity')) {
    return WispActionType.ENTITY_EXPLAIN;
  }
  if (l.includes('scene') || l.includes('what just happened') || l.includes('explain')) {
    return WispActionType.SCENE_EXPLAIN;
  }
  if (l.includes('catch up') || l.includes('recap') || l.includes('summary')) {
    return WispActionType.EPISODE_RECAP;
  }
  if (l.includes('quiz')) {
    return WispActionType.POST_WATCH_QUIZ;
  }
  return WispActionType.CONTEXTUAL_QA;
}

/**
 * Pure firewall function enforcing temporal clamping and 10-foot TV chip guarantees.
 */
export function enforceSpoilerFirewall(
  card: any,
  playbackPositionMs?: number,
): WispResponseCardDto {
  if (!card || typeof card !== 'object') {
    return card;
  }

  // 1. Invariant 3: Deterministic Spoiler Safety
  // Clamp spoilerSafeUpToMs to strictly never exceed playbackPositionMs
  if (playbackPositionMs !== undefined && playbackPositionMs !== null && !isNaN(playbackPositionMs)) {
    const safeFloor = Math.max(0, Number(playbackPositionMs));
    if (typeof card.spoilerSafeUpToMs === 'number' && card.spoilerSafeUpToMs > safeFloor) {
      const logger = new Logger('SpoilerFirewall');
      logger.warn(
        `Anti-spoiler anomaly detected: spoilerSafeUpToMs (${card.spoilerSafeUpToMs}ms) > playbackPositionMs (${safeFloor}ms). Clamping to floor.`,
      );
      card.spoilerSafeUpToMs = safeFloor;
    }
  }

  // 2. Invariant 4: Zero-Typing 10-Foot First UX Guarantee
  // Normalize and ensure 2–4 QuickActionChips on followUpChips for Fire TV D-pad UX
  let normalizedChips: QuickActionChip[] = [];

  if (Array.isArray(card.followUpChips) && card.followUpChips.length > 0) {
    normalizedChips = card.followUpChips
      .filter((c: any) => c && (typeof c.label === 'string' || typeof c.text === 'string'))
      .map((c: any, idx: number) => {
        const label = String(c.label || c.text || '').trim();
        return {
          id: c.id || `chip-${idx + 1}`,
          label,
          actionType: c.actionType || inferActionType(label),
        };
      })
      .filter((c: QuickActionChip) => c.label.length > 0);
  } else {
    const rawActions = Array.isArray(card.suggestedActions)
      ? card.suggestedActions
      : Array.isArray(card.followUpActions)
        ? card.followUpActions
        : [];
    normalizedChips = rawActions
      .filter((a: any) => typeof a === 'string' && a.trim().length > 0)
      .map((label: string, idx: number) => ({
        id: `chip-${idx + 1}`,
        label: label.trim(),
        actionType: inferActionType(label),
      }));
  }

  if (normalizedChips.length < 2) {
    normalizedChips = [...DEFAULT_FIREWALL_CHIPS];
  } else if (normalizedChips.length > 4) {
    normalizedChips = normalizedChips.slice(0, 4);
  }

  card.followUpChips = normalizedChips;
  // Preserve suggestedActions array of string labels for backwards compatibility
  card.suggestedActions = normalizedChips.map((c) => c.label);

  return card;
}

@Injectable()
export class SpoilerFirewallInterceptor implements NestInterceptor {
  private readonly logger = new Logger(SpoilerFirewallInterceptor.name);

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const playbackPositionMs =
      request.body?.playbackPositionMs ??
      request.query?.playbackMs ??
      request.query?.playbackPositionMs;

    return next.handle().pipe(
      map((data) => {
        if (!data || typeof data !== 'object') {
          return data;
        }

        const effectivePlaybackMs =
          playbackPositionMs !== undefined && playbackPositionMs !== null
            ? Number(playbackPositionMs)
            : typeof data.safe_playback_ms === 'number'
              ? data.safe_playback_ms
              : undefined;

        // 1. Direct response card (contains headline / actionType / spoilerSafeUpToMs)
        if ('spoilerSafeUpToMs' in data || 'actionType' in data || 'headline' in data) {
          return enforceSpoilerFirewall(data, effectivePlaybackMs);
        }

        // 2. Stage-1 Single-Roundtrip Fire TV Bootstrap payload
        if (data.prewarmed_cards && typeof data.prewarmed_cards === 'object') {
          if (Array.isArray(data.prewarmed_cards)) {
            data.prewarmed_cards = data.prewarmed_cards.map((entry: any) => {
              if (!entry || typeof entry !== 'object') return entry;
              if (entry.card && typeof entry.card === 'object') {
                entry.card = enforceSpoilerFirewall(entry.card, effectivePlaybackMs);
              } else if ('spoilerSafeUpToMs' in entry || 'headline' in entry) {
                return enforceSpoilerFirewall(entry, effectivePlaybackMs);
              }
              return entry;
            });
          } else {
            for (const key of Object.keys(data.prewarmed_cards)) {
              const item = data.prewarmed_cards[key];
              if (item && typeof item === 'object') {
                if (item.card && typeof item.card === 'object') {
                  item.card = enforceSpoilerFirewall(item.card, effectivePlaybackMs);
                } else if ('spoilerSafeUpToMs' in item || 'headline' in item) {
                  data.prewarmed_cards[key] = enforceSpoilerFirewall(item, effectivePlaybackMs);
                }
              }
            }
          }
        }

        return data;
      }),
    );
  }
}
