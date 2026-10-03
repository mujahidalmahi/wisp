import { BadRequestException, Injectable, PipeTransform } from '@nestjs/common';

@Injectable()
export class ParseSlugPipe implements PipeTransform<string, string> {
  private readonly slugRegex = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

  transform(value: string): string {
    if (!value || typeof value !== 'string') {
      throw new BadRequestException('Slug parameter is required and must be a string');
    }

    const trimmed = value.trim().toLowerCase();
    if (trimmed.length > 100) {
      throw new BadRequestException('Slug parameter cannot exceed 100 characters');
    }
    if (!this.slugRegex.test(trimmed)) {
      throw new BadRequestException(
        `Invalid slug format '${value}': must be lower-case alphanumeric with hyphens (e.g. 'tears-of-steel')`,
      );
    }

    return trimmed;
  }
}
