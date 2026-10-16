import {
  BadRequestException,
  Injectable,
  NestMiddleware,
} from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';

@Injectable()
export class HppMiddleware implements NestMiddleware {
  private readonly sensitiveQueryParams = new Set([
    'deviceid',
    'device_id',
    'profileid',
    'profile_id',
    'episodeid',
    'episode_id',
    'playbackms',
    'playbackpositionms',
    'lookbackms',
    'cursor',
  ]);

  use(req: Request, res: Response, next: NextFunction) {
    if (req.query && typeof req.query === 'object') {
      for (const [key, value] of Object.entries(req.query)) {
        if (Array.isArray(value)) {
          const lowerKey = key.toLowerCase();
          if (this.sensitiveQueryParams.has(lowerKey)) {
            throw new BadRequestException(
              `HTTP Parameter Pollution detected: duplicate sensitive query parameter '${key}' is strictly forbidden.`,
            );
          }
          // For safe non-sensitive parameters, deduplicate deterministically to first value
          req.query[key] = value[0];
        }
      }
    }
    next();
  }
}
