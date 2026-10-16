/**
 * Safe client IP extraction enforcing trusted proxy boundaries.
 * Forwarding headers (CF-Connecting-IP, X-Forwarded-For) are trusted ONLY when
 * TRUST_PROXY environment variable is explicitly enabled ('true' or '1').
 * Direct or untrusted connections use req.socket.remoteAddress directly.
 */
export function extractClientIp(request: any): string {
  const isTrustedProxy =
    process.env.TRUST_PROXY === 'true' || process.env.TRUST_PROXY === '1';

  if (isTrustedProxy) {
    const cfIp = request?.headers?.['cf-connecting-ip'];
    if (typeof cfIp === 'string' && cfIp.trim().length > 0) {
      return normalizeIp(cfIp.trim());
    }

    const rawForwarded = request?.headers?.['x-forwarded-for'];
    if (typeof rawForwarded === 'string' && rawForwarded.length > 0) {
      const first = rawForwarded.split(',')[0].trim();
      if (first) {
        return normalizeIp(first);
      }
    }

    if (typeof request?.ip === 'string' && request.ip.trim().length > 0) {
      return normalizeIp(request.ip.trim());
    }
  }

  // Direct connection path: ignore forwarding headers to prevent header spoofing attacks
  const directAddress =
    (typeof request?.ip === 'string' && request.ip.trim().length > 0 ? request.ip.trim() : null) ||
    request?.socket?.remoteAddress ||
    request?.connection?.remoteAddress ||
    '127.0.0.1';

  return normalizeIp(directAddress);
}

function normalizeIp(ip: string): string {
  const trimmed = ip.trim();
  if (trimmed.startsWith('::ffff:')) {
    return trimmed.slice(7);
  }
  return trimmed;
}
