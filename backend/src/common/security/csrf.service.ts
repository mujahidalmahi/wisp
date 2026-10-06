import { Injectable, Logger } from '@nestjs/common';
import * as crypto from 'crypto';

export interface CsrfTokenResponse {
  csrfToken: string;
  expiresInSeconds: number;
  headerName: string;
}

@Injectable()
export class CsrfService {
  private readonly logger = new Logger(CsrfService.name);
  private readonly secretKey: string;
  private readonly defaultTtlSeconds = 3600; // 1 hour validity

  constructor() {
    this.secretKey = this.resolveCsrfSecret();
  }

  private resolveCsrfSecret(): string {
    const configured =
      process.env.CSRF_SECRET ||
      process.env.DEVICE_AUTH_SECRET ||
      process.env.JWT_SECRET;

    if (configured && configured.trim().length > 0) {
      return configured.trim();
    }

    if (process.env.NODE_ENV === 'production') {
      throw new Error(
        'CRITICAL CONFIGURATION ERROR: CSRF_SECRET (or DEVICE_AUTH_SECRET) is required in production mode.',
      );
    }

    return 'wisp-csrf-dev-secret-token-2026';
  }

  /**
   * Generates a tamper-proof HMAC-SHA256 signed CSRF token with timestamp and high-entropy nonce.
   */
  generateToken(ttlSeconds = this.defaultTtlSeconds): CsrfTokenResponse {
    const timestampMs = Date.now();
    const nonceHex = crypto.randomBytes(16).toString('hex');
    const timeHex = timestampMs.toString(16);

    const dataToSign = `${timeHex}:${nonceHex}`;
    const signature = crypto
      .createHmac('sha256', this.secretKey)
      .update(dataToSign)
      .digest('hex');

    const csrfToken = `${timeHex}.${nonceHex}.${signature}`;

    return {
      csrfToken,
      expiresInSeconds: ttlSeconds,
      headerName: 'X-CSRF-Token',
    };
  }

  /**
   * Cryptographically verifies an incoming CSRF token.
   * Performs constant-time signature comparison and validates temporal expiration.
   */
  verifyToken(token: unknown, ttlSeconds = this.defaultTtlSeconds): boolean {
    if (!token || typeof token !== 'string') {
      return false;
    }

    const cleanToken = token.trim();
    const parts = cleanToken.split('.');
    if (parts.length !== 3) {
      return false;
    }

    const [timeHex, nonceHex, signature] = parts;
    if (!timeHex || !nonceHex || !signature) {
      return false;
    }

    // Validate hex formatting
    if (!/^[0-9a-f]+$/i.test(timeHex) || !/^[0-9a-f]+$/i.test(nonceHex) || !/^[0-9a-f]+$/i.test(signature)) {
      return false;
    }

    const timestampMs = parseInt(timeHex, 16);
    if (isNaN(timestampMs) || timestampMs <= 0) {
      return false;
    }

    const now = Date.now();
    const maxAgeMs = ttlSeconds * 1000;

    // Reject tokens expired or with timestamp suspiciously far in future (>60s clock drift)
    if (now - timestampMs > maxAgeMs || timestampMs > now + 60000) {
      return false;
    }

    // Compute expected HMAC
    const expectedSig = crypto
      .createHmac('sha256', this.secretKey)
      .update(`${timeHex}:${nonceHex}`)
      .digest('hex');

    const candBuf = Buffer.from(signature);
    const expBuf = Buffer.from(expectedSig);

    if (candBuf.length !== expBuf.length) {
      return false;
    }

    return crypto.timingSafeEqual(candBuf, expBuf);
  }
}
