import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';

// Dangerous control characters (excluding newline \x0A, carriage return \x0D, and tab \x09)
const DANGEROUS_CONTROL_CHARS_REGEX = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g;

// LLM prompt-injection instruction override delimiters
const PROMPT_DELIMITERS_REGEX =
  /(?:<\|(?:im_start|im_end|system|user|assistant|endoftext|fim_prefix|fim_middle|fim_suffix)\|>|\[(?:INST|\/INST|SYSTEM|\/SYSTEM)\]|<<\/?SYS>>)/gi;

// Unicode directional formatting overrides and zero-width evasion characters
const UNICODE_BIDI_AND_EVASION_REGEX =
  /[\u200B-\u200D\uFEFF\u202A-\u202E\u2066-\u2069]/g;

/**
 * Normalizes and sanitizes untrusted string input defensively without destroying
 * natural-language queries, punctuation, Unicode characters, or emojis.
 */
export function sanitizeInputString(input: string): string {
  if (typeof input !== 'string') return input;

  return input
    // 1. Strip raw control characters and null bytes
    .replace(DANGEROUS_CONTROL_CHARS_REGEX, '')
    // 2. Strip Unicode bidirectional overrides and zero-width characters
    .replace(UNICODE_BIDI_AND_EVASION_REGEX, '')
    // 3. Strip LLM boundary delimiter override markers
    .replace(PROMPT_DELIMITERS_REGEX, '')
    .trim();
}

/**
 * Recursively sanitizes strings within an arbitrary payload object or array.
 */
export function sanitizePayloadRecursively(value: unknown): unknown {
  if (typeof value === 'string') {
    return sanitizeInputString(value);
  }
  if (Array.isArray(value)) {
    return value.map(sanitizePayloadRecursively);
  }
  if (value !== null && typeof value === 'object' && !(value instanceof Date)) {
    const sanitizedObj: Record<string, any> = {};
    for (const [key, val] of Object.entries(value)) {
      sanitizedObj[key] = sanitizePayloadRecursively(val);
    }
    return sanitizedObj;
  }
  return value;
}

@Injectable()
export class InputSanitizationMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    if (req.body && typeof req.body === 'object') {
      req.body = sanitizePayloadRecursively(req.body);
    }
    if (req.query && typeof req.query === 'object') {
      req.query = sanitizePayloadRecursively(req.query) as any;
    }
    next();
  }
}
