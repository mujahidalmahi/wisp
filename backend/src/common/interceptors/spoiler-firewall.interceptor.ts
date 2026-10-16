import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { WispResponseCardDto } from '../dto/wisp-query.dto';

export const DEFAULT_FIREWALL_QUICK_ACTIONS = [
  'Explain what just happened',
  'Who is on screen?',
  'Catch me up to this moment',
];

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
  // Ensure every response card provides 2–4 D-pad selectable quick action chips
  const actions = Array.isArray(card.suggestedActions)
    ? card.suggestedActions.filter((a: any) => typeof a === 'string' && a.trim().length > 0)
    : [];

  if (actions.length < 2) {
    card.suggestedActions = [...DEFAULT_FIREWALL_QUICK_ACTIONS];
  } else if (actions.length > 4) {
    card.suggestedActions = actions.slice(0, 4);
  } else {
    card.suggestedActions = actions;
  }

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

        // Apply firewall if this is a response card (contains headline / actionType / spoilerSafeUpToMs)
        if ('spoilerSafeUpToMs' in data || 'actionType' in data || 'headline' in data) {
          return enforceSpoilerFirewall(data, playbackPositionMs);
        }

        return data;
      }),
    );
  }
}
