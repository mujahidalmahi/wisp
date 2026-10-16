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

  computeClientHash(clientIdentifier: string): string {
    const normalized = (clientIdentifier || 'anonymous').trim().toLowerCase();
    return crypto
      .createHmac('sha256', this.secretKey)
      .update(`client:${normalized}`)
      .digest('hex')
      .slice(0, 16);
  }

  /**
   * Generates a tamper-proof HMAC-SHA256 signed CSRF token bound to client identity.
   * Format: timeHex.nonceHex.clientHash.signature
   */
  generateToken(
    clientIdentifier?: string | number,
    ttlSeconds?: number,
  ): CsrfTokenResponse {
    let clientId = '127.0.0.1';
    let ttl = this.defaultTtlSeconds;

    if (typeof clientIdentifier === 'number') {
      ttl = clientIdentifier;
    } else if (
      typeof clientIdentifier === 'string' &&
      clientIdentifier.trim().length > 0
    ) {
      clientId = clientIdentifier.trim();
      if (typeof ttlSeconds === 'number') {
        ttl = ttlSeconds;
      }
    } else if (typeof ttlSeconds === 'number') {
      ttl = ttlSeconds;
    }

    const timestampMs = Date.now();
    const nonceHex = crypto.randomBytes(16).toString('hex');
    const timeHex = timestampMs.toString(16);
    const clientHash = this.computeClientHash(clientId);

    const dataToSign = `${timeHex}:${nonceHex}:${clientHash}`;
    const signature = crypto
      .createHmac('sha256', this.secretKey)
      .update(dataToSign)
      .digest('hex');

    const csrfToken = `${timeHex}.${nonceHex}.${clientHash}.${signature}`;

    return {
      csrfToken,
      expiresInSeconds: ttl,
      headerName: 'X-CSRF-Token',
    };
  }

  /**
   * Cryptographically verifies an incoming CSRF token.
   * Performs constant-time signature comparison, client identity binding check, and temporal expiration.
   */
  verifyToken(
    token: unknown,
    clientIdentifier?: string,
    ttlSeconds = this.defaultTtlSeconds,
  ): boolean {
    if (!token || typeof token !== 'string') {
      return false;
    }

    const cleanToken = token.trim();
    const parts = cleanToken.split('.');

    // 4-part client-bound token: [timeHex, nonceHex, clientHash, signature]
    if (parts.length === 4) {
      const [timeHex, nonceHex, clientHash, signature] = parts;
      if (!timeHex || !nonceHex || !clientHash || !signature) {
        return false;
      }

      if (
        !/^[0-9a-f]+$/i.test(timeHex) ||
        !/^[0-9a-f]+$/i.test(nonceHex) ||
        !/^[0-9a-f]+$/i.test(clientHash) ||
        !/^[0-9a-f]+$/i.test(signature)
      ) {
        return false;
      }

      const timestampMs = parseInt(timeHex, 16);
      if (isNaN(timestampMs) || timestampMs <= 0) {
        return false;
      }

      const now = Date.now();
      const maxAgeMs = ttlSeconds * 1000;

      if (now - timestampMs > maxAgeMs || timestampMs > now + 60000) {
        return false;
      }

      // 1. Verify cryptographic HMAC signature
      const expectedSig = crypto
        .createHmac('sha256', this.secretKey)
        .update(`${timeHex}:${nonceHex}:${clientHash}`)
        .digest('hex');

      const candBuf = Buffer.from(signature);
      const expBuf = Buffer.from(expectedSig);

      if (candBuf.length !== expBuf.length || !crypto.timingSafeEqual(candBuf, expBuf)) {
        return false;
      }

      // 2. Verify client identity binding if clientIdentifier provided
      if (clientIdentifier !== undefined && clientIdentifier !== null) {
        const expectedClientHash = this.computeClientHash(clientIdentifier);
        const candHashBuf = Buffer.from(clientHash);
        const expHashBuf = Buffer.from(expectedClientHash);
        if (
          candHashBuf.length !== expHashBuf.length ||
          !crypto.timingSafeEqual(candHashBuf, expHashBuf)
        ) {
          return false;
        }
      }

      return true;
    }

    // 3-part legacy token: [timeHex, nonceHex, signature]
    if (parts.length === 3) {
      // In production or when client identity is explicitly requested, reject unbound 3-part tokens
      if (clientIdentifier && process.env.NODE_ENV === 'production') {
        return false;
      }

      const [timeHex, nonceHex, signature] = parts;
      if (!timeHex || !nonceHex || !signature) {
        return false;
      }

      if (
        !/^[0-9a-f]+$/i.test(timeHex) ||
        !/^[0-9a-f]+$/i.test(nonceHex) ||
        !/^[0-9a-f]+$/i.test(signature)
      ) {
        return false;
      }

      const timestampMs = parseInt(timeHex, 16);
      if (isNaN(timestampMs) || timestampMs <= 0) {
        return false;
      }

      const now = Date.now();
      const maxAgeMs = ttlSeconds * 1000;

      if (now - timestampMs > maxAgeMs || timestampMs > now + 60000) {
        return false;
      }

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

    return false;
  }
}
