import {
  Injectable,
  Logger,
  OnModuleInit,
  UnauthorizedException,
} from '@nestjs/common';
import * as crypto from 'crypto';

export interface DeviceTokenPayload {
  deviceId: string;
  iat: number;
  exp?: number;
  iss?: string;
  [key: string]: any;
}

export interface VerifiedDeviceIdentity {
  deviceId: string;
  payload: DeviceTokenPayload;
}

@Injectable()
export class DeviceTokenService implements OnModuleInit {
  private readonly logger = new Logger(DeviceTokenService.name);
  private secretKey: string;

  constructor() {
    this.secretKey = this.resolveSecretKey();
  }

  onModuleInit() {
    const isProduction = process.env.NODE_ENV === 'production';
    if (
      isProduction &&
      !process.env.DEVICE_AUTH_SECRET &&
      !process.env.SUPABASE_JWT_SECRET &&
      !process.env.JWT_SECRET
    ) {
      throw new Error(
        'CRITICAL CONFIGURATION ERROR: DEVICE_AUTH_SECRET (or SUPABASE_JWT_SECRET) is required in production mode for device authentication.',
      );
    }
  }

  private resolveSecretKey(): string {
    const configured =
      process.env.DEVICE_AUTH_SECRET ||
      process.env.SUPABASE_JWT_SECRET ||
      process.env.JWT_SECRET;
    if (configured && configured.trim().length > 0) {
      return configured.trim();
    }
    // Deterministic secret for non-production / test environments
    return 'wisp-dev-device-token-secret-2026';
  }

  /**
   * Cryptographically signs a verifiable device token with HMAC-SHA256
   */
  signDeviceToken(
    deviceId: string,
    expiresInSeconds: number = 30 * 24 * 3600, // 30 days default
  ): string {
    const cleanDeviceId = (deviceId || '').trim();
    if (!cleanDeviceId || cleanDeviceId.length < 3) {
      throw new Error('deviceId must be a non-empty string with at least 3 characters');
    }

    const nowSec = Math.floor(Date.now() / 1000);
    const payload: DeviceTokenPayload = {
      deviceId: cleanDeviceId,
      iat: nowSec,
      exp: nowSec + expiresInSeconds,
      iss: 'wisp-device-auth',
    };

    const header = { alg: 'HS256', typ: 'JWT' };
    const encodedHeader = Buffer.from(JSON.stringify(header)).toString('base64url');
    const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const signature = crypto
      .createHmac('sha256', this.secretKey)
      .update(`${encodedHeader}.${encodedPayload}`)
      .digest('base64url');

    return `${encodedHeader}.${encodedPayload}.${signature}`;
  }

  /**
   * Cryptographically verifies a signed device token or Supabase JWT token.
   * Performs constant-time comparison against expected HMAC-SHA256 signature.
   */
  verifyDeviceToken(token: string): VerifiedDeviceIdentity {
    if (!token || typeof token !== 'string') {
      throw new UnauthorizedException('Missing or invalid device token');
    }

    const cleanToken = token.trim();
    const parts = cleanToken.split('.');
    if (parts.length !== 3) {
      throw new UnauthorizedException('Malformed device token structure: token must have header.payload.signature format');
    }

    const [headerB64, payloadB64, signatureB64] = parts;

    // Verify cryptographic signature with constant-time comparison
    const expectedSignature = crypto
      .createHmac('sha256', this.secretKey)
      .update(`${headerB64}.${payloadB64}`)
      .digest('base64url');

    const sigBuf = Buffer.from(signatureB64);
    const expBuf = Buffer.from(expectedSignature);

    let isValidSignature =
      sigBuf.length === expBuf.length && crypto.timingSafeEqual(sigBuf, expBuf);

    // If primary secret failed and a secondary JWT secret is configured, attempt fallback
    if (
      !isValidSignature &&
      process.env.SUPABASE_JWT_SECRET &&
      process.env.SUPABASE_JWT_SECRET.trim() !== this.secretKey
    ) {
      const fallbackSig = crypto
        .createHmac('sha256', process.env.SUPABASE_JWT_SECRET.trim())
        .update(`${headerB64}.${payloadB64}`)
        .digest('base64url');
      const fallBuf = Buffer.from(fallbackSig);
      if (sigBuf.length === fallBuf.length && crypto.timingSafeEqual(sigBuf, fallBuf)) {
        isValidSignature = true;
      }
    }

    if (!isValidSignature) {
      throw new UnauthorizedException('Invalid device token cryptographic signature');
    }

    // Parse payload
    let payload: DeviceTokenPayload;
    try {
      payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf-8'));
    } catch {
      throw new UnauthorizedException('Invalid device token payload encoding');
    }

    // Expiration verification
    if (payload.exp && typeof payload.exp === 'number') {
      const nowSec = Math.floor(Date.now() / 1000);
      if (nowSec > payload.exp) {
        throw new UnauthorizedException('Device token has expired');
      }
    }

    // Extract device identity from standard claim keys
    const deviceId = (payload.deviceId || payload.device_id || payload.sub || '').toString().trim();
    if (!deviceId || deviceId.length < 3) {
      throw new UnauthorizedException('Device token does not contain a valid device identity claim');
    }

    return { deviceId, payload };
  }

  /**
   * Extracts device credential from HTTP request headers and cryptographically verifies it.
   * Derives identity strictly from verifiable credentials, never from request body or query.
   */
  extractAndVerify(request: any): VerifiedDeviceIdentity {
    const authHeader = request.headers['authorization'];
    const deviceTokenHeader = request.headers['x-device-token'];
    let rawToken: string | undefined;

    if (typeof authHeader === 'string') {
      if (authHeader.startsWith('Bearer ')) {
        rawToken = authHeader.slice(7).trim();
      } else if (authHeader.startsWith('Device ')) {
        rawToken = authHeader.slice(7).trim();
      }
    }

    if (!rawToken && typeof deviceTokenHeader === 'string') {
      rawToken = deviceTokenHeader.trim();
    }

    if (rawToken) {
      return this.verifyDeviceToken(rawToken);
    }

    // Non-production test/development convenience ONLY when explicitly enabled:
    const allowInsecureDev = process.env.ALLOW_INSECURE_DEV_DEVICE_HEADERS === 'true';
    const isProduction = process.env.NODE_ENV === 'production';
    if (!isProduction && allowInsecureDev && typeof request.headers['x-device-id'] === 'string') {
      const devId = request.headers['x-device-id'].trim();
      if (devId.length >= 3) {
        return {
          deviceId: devId,
          payload: { deviceId: devId, iat: Math.floor(Date.now() / 1000) },
        };
      }
    }

    throw new UnauthorizedException(
      'Device authentication required: provide signed device token via Authorization (Bearer or Device) or X-Device-Token header',
    );
  }
}
