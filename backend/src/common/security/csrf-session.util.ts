import * as crypto from 'crypto';
import { extractClientIp } from './client-ip.util';

export const CSRF_SESSION_COOKIE = 'wisp_csrf_session';

/**
 * Extracts a stable browser session identifier from cookies or headers,
 * or generates and sets a new HttpOnly cookie when a response object is available.
 */
export function resolveOrCreateCsrfSessionId(req: any, res?: any): string {
  // 1. Check cookies for existing session identifier
  const rawCookie = req?.headers?.cookie;
  if (typeof rawCookie === 'string') {
    const match = rawCookie.match(new RegExp(`(?:^|;\\s*)${CSRF_SESSION_COOKIE}=([^;]+)`));
    if (match && match[1] && match[1].trim().length >= 8) {
      return match[1].trim();
    }
  }

  // 2. Check explicit session header (e.g. from single-page web app / testing)
  const headerSession =
    req?.headers?.['x-session-id'] ||
    req?.headers?.['x-client-session-id'] ||
    req?.headers?.['x-csrf-session-id'];
  if (typeof headerSession === 'string' && headerSession.trim().length >= 8) {
    return headerSession.trim();
  }

  // 3. Generate a new cryptographically random session ID
  const newSessionId = crypto.randomBytes(16).toString('hex');

  // Set HttpOnly cookie on response if response object is provided
  if (res && typeof res.setHeader === 'function') {
    const isProd = process.env.NODE_ENV === 'production';
    const cookieFlags = [
      `${CSRF_SESSION_COOKIE}=${newSessionId}`,
      'Path=/',
      'HttpOnly',
      'SameSite=Lax',
    ];
    if (isProd) {
      cookieFlags.push('Secure');
    }
    res.setHeader('Set-Cookie', cookieFlags.join('; '));
  }

  return newSessionId;
}

/**
 * Resolves the CSRF client binding identifier for validation.
 * Prioritizes stable browser session cookie/header, and falls back to trusted client IP.
 */
export function resolveClientBindingIdentifier(req: any): string {
  const rawCookie = req?.headers?.cookie;
  if (typeof rawCookie === 'string') {
    const match = rawCookie.match(new RegExp(`(?:^|;\\s*)${CSRF_SESSION_COOKIE}=([^;]+)`));
    if (match && match[1] && match[1].trim().length >= 8) {
      return `session:${match[1].trim()}`;
    }
  }

  const headerSession =
    req?.headers?.['x-session-id'] ||
    req?.headers?.['x-client-session-id'] ||
    req?.headers?.['x-csrf-session-id'];
  if (typeof headerSession === 'string' && headerSession.trim().length >= 8) {
    return `session:${headerSession.trim()}`;
  }

  // Fallback to trusted IP if no session identifier is present
  return `ip:${extractClientIp(req)}`;
}
