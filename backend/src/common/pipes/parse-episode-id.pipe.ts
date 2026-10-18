import { BadRequestException, Injectable, PipeTransform } from '@nestjs/common';

/**
 * Validates episode identifiers passed in route parameters.
 * Accepts standard UUIDs (e.g. 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1')
 * as well as human-readable slugs (e.g. 'sintel-ep1', 'tos-ep1')
 * while rejecting invalid characters, SQL injections, and malformed strings
 * with an HTTP 400 Bad Request before database queries occur.
 */
@Injectable()
export class ParseEpisodeIdPipe implements PipeTransform<string, string> {
  private readonly episodeIdRegex = /^[a-zA-Z0-9_\-]{1,64}$/;

  transform(value: string): string {
    if (!value || typeof value !== 'string') {
      throw new BadRequestException('Episode ID parameter is required and must be a string');
    }

    const trimmed = value.trim();
    if (trimmed.length > 64) {
      throw new BadRequestException('Episode ID parameter cannot exceed 64 characters');
    }

    if (!this.episodeIdRegex.test(trimmed)) {
      throw new BadRequestException(
        `Invalid episode ID format '${value}': must be a valid UUID or alphanumeric identifier (max 64 characters)`,
      );
    }

    return trimmed;
  }
}
