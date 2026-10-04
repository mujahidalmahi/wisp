import {
  Injectable,
  Logger,
  OnModuleInit,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import * as crypto from 'crypto';
import * as jwt from 'jsonwebtoken';

export interface DeviceTokenPayload {
  deviceId: string;
  sub: string;
  typ: string;
  iat: number;
  exp: number;
  iss: string;
  aud: string;
  [key: string]: any;
}

export interface VerifiedDeviceIdentity {
  deviceId: string;
  payload: DeviceTokenPayload;
}

export interface DeviceEnrollmentResult {
  deviceId: string;
  deviceSecret: string;
  token: string;
  expires_in: number;
  token_type: string;
}

@Injectable()
export class DeviceTokenService implements OnModuleInit {
  private readonly logger = new Logger(DeviceTokenService.name);
  private secretKey: string;
  private previousSecretKey?: string;
  private enrollmentSecret?: string;
  private readonly issuer: string;
  private readonly audience: string;

  constructor() {
    this.secretKey = this.resolveSecretKey();
    this.previousSecretKey = this.resolvePreviousSecretKey();
    this.enrollmentSecret = this.resolveEnrollmentSecret();
    this.issuer = process.env.JWT_ISSUER?.trim() || 'wisp-device-auth';
    this.audience = process.env.JWT_AUDIENCE?.trim() || 'wisp-firetv-client';
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
      process.env.JWT_SECRET ||
      process.env.SUPABASE_JWT_SECRET;
    if (configured && configured.trim().length > 0) {
      return configured.trim();
    }
    // Deterministic secret for non-production / test environments
    return 'wisp-dev-device-token-secret-2026';
  }

  private resolvePreviousSecretKey(): string | undefined {
    const configured =
      process.env.DEVICE_AUTH_PREVIOUS_SECRET ||
      process.env.JWT_PREVIOUS_SECRET;
    return configured && configured.trim().length > 0 ? configured.trim() : undefined;
  }

  private resolveEnrollmentSecret(): string | undefined {
    const configured =
      process.env.DEVICE_ENROLLMENT_SECRET ||
      process.env.FIRE_TV_PROVISIONING_SECRET;
    if (configured && configured.trim().length > 0) {
      return configured.trim();
    }
    // Deterministic enrollment secret for non-production / test environments
    const isProduction = process.env.NODE_ENV === 'production';
    return isProduction ? undefined : 'wisp-dev-device-enrollment-secret-2026';
  }

  /**
   * Deterministically derives a high-entropy device secret for a given deviceId
   * using HMAC-SHA256 with the master server secret. Unforgeable without server secret.
   */
  deriveDeviceSecret(deviceId: string): string {
    const cleanId = (deviceId || '').trim();
    if (!cleanId || cleanId.length < 3) {
      throw new Error('deviceId must be a non-empty string with at least 3 characters');
    }
    return crypto
      .createHmac('sha256', this.secretKey)
      .update(`wisp-device-secret:${cleanId}`)
      .digest('hex');
  }

  /**
   * Performs constant-time verification of a candidate device secret for deviceId.
   */
  verifyDeviceSecret(deviceId: string, candidateSecret: string): boolean {
    if (!candidateSecret || typeof candidateSecret !== 'string') return false;
    const expected = this.deriveDeviceSecret(deviceId);
    const candBuf = Buffer.from(candidateSecret.trim());
    const expBuf = Buffer.from(expected);
    if (candBuf.length !== expBuf.length) return false;
    return crypto.timingSafeEqual(candBuf, expBuf);
  }

  /**
   * Performs constant-time verification of a candidate fleet enrollment key.
   */
  verifyEnrollmentKey(candidateKey?: string): boolean {
    if (!candidateKey || typeof candidateKey !== 'string') return false;
    if (!this.enrollmentSecret) return false;
    const candBuf = Buffer.from(candidateKey.trim());
    const expBuf = Buffer.from(this.enrollmentSecret);
    if (candBuf.length !== expBuf.length) return false;
    return crypto.timingSafeEqual(candBuf, expBuf);
  }

  /**
   * Authenticates device enrollment or token renewal:
   * Requires either a valid fleet enrollment key (initial setup) OR a valid device secret (subsequent renewal).
   * Prevents unauthenticated callers from minting tokens for arbitrary device IDs.
   */
  authenticateAndIssueToken(
    deviceId: string,
    credentials: {
      deviceSecret?: string;
      enrollmentKey?: string;
    },
    expiresInSeconds: number = 30 * 24 * 3600,
  ): DeviceEnrollmentResult {
    const cleanId = (deviceId || '').trim();
    if (!cleanId || cleanId.length < 3) {
      throw new UnauthorizedException('Invalid device identifier');
    }

    const isProduction = process.env.NODE_ENV === 'production';
    if (isProduction && !this.enrollmentSecret && !this.secretKey) {
      throw new ServiceUnavailableException('Device authentication service unconfigured');
    }

    const hasValidEnrollment = this.verifyEnrollmentKey(credentials.enrollmentKey);
    const hasValidDeviceSecret = credentials.deviceSecret
      ? this.verifyDeviceSecret(cleanId, credentials.deviceSecret)
      : false;

    if (!hasValidEnrollment && !hasValidDeviceSecret) {
      throw new UnauthorizedException(
        'Device authentication failed: valid enrollmentKey or deviceSecret required to issue token',
      );
    }

    const persistentDeviceSecret = this.deriveDeviceSecret(cleanId);
    const token = this.signDeviceToken(cleanId, expiresInSeconds);

    return {
      deviceId: cleanId,
      deviceSecret: persistentDeviceSecret,
      token,
      expires_in: expiresInSeconds,
      token_type: 'Bearer',
    };
  }

  /**
   * Cryptographically signs a verifiable device token using jsonwebtoken (HMAC-SHA256)
   * with standard RFC 7519 claims: sub, deviceId, iss, aud, iat, exp.
   */
  signDeviceToken(
    deviceId: string,
    expiresInSeconds: number = 30 * 24 * 3600, // 30 days default
  ): string {
    const cleanDeviceId = (deviceId || '').trim();
    if (!cleanDeviceId || cleanDeviceId.length < 3) {
      throw new Error('deviceId must be a non-empty string with at least 3 characters');
    }

    const payload = {
      deviceId: cleanDeviceId,
      typ: 'device-token',
    };

    return jwt.sign(payload, this.secretKey, {
      algorithm: 'HS256',
      expiresIn: expiresInSeconds,
      issuer: this.issuer,
      audience: this.audience,
      subject: cleanDeviceId,
    });
  }

  /**
   * Cryptographically verifies a signed device token using jsonwebtoken.
   * Enforces algorithm HS256, issuer, audience, and expiration with 60s clock tolerance.
   * Supports key rotation via previousSecretKey.
   */
  verifyDeviceToken(token: string): VerifiedDeviceIdentity {
    if (!token || typeof token !== 'string') {
      throw new UnauthorizedException('Missing or invalid device token');
    }

    const cleanToken = token.trim();
    const parts = cleanToken.split('.');
    if (parts.length !== 3) {
      throw new UnauthorizedException(
        'Malformed device token structure: token must have header.payload.signature format',
      );
    }

    const verifyOptions: jwt.VerifyOptions = {
      algorithms: ['HS256'],
      issuer: this.issuer,
      audience: this.audience,
      clockTolerance: 60,
    };

    let decoded: any;
    try {
      decoded = jwt.verify(cleanToken, this.secretKey, verifyOptions);
    } catch (err: any) {
      if (err instanceof jwt.TokenExpiredError) {
        throw new UnauthorizedException('Device token has expired');
      }

      // Check key rotation with previousSecretKey if configured
      if (this.previousSecretKey) {
        try {
          decoded = jwt.verify(cleanToken, this.previousSecretKey, verifyOptions);
        } catch (prevErr: any) {
          if (prevErr instanceof jwt.TokenExpiredError) {
            throw new UnauthorizedException('Device token has expired');
          }
        }
      }

      // If Supabase JWT secret is configured as a secondary verifier, check with standard claims
      if (
        !decoded &&
        process.env.SUPABASE_JWT_SECRET &&
        process.env.SUPABASE_JWT_SECRET.trim() !== this.secretKey
      ) {
        try {
          decoded = jwt.verify(
            cleanToken,
            process.env.SUPABASE_JWT_SECRET.trim(),
            {
              algorithms: ['HS256'],
              clockTolerance: 60,
            },
          );
        } catch {
          // Fall through to unauthorized
        }
      }

      if (!decoded) {
        throw new UnauthorizedException('Invalid device token cryptographic signature');
      }
    }

    // Extract device identity from verified standard claims
    const deviceId = (decoded.deviceId || decoded.sub || decoded.device_id || '').toString().trim();
    if (!deviceId || deviceId.length < 3) {
      throw new UnauthorizedException('Device token does not contain a valid device identity claim');
    }

    return {
      deviceId,
      payload: decoded as DeviceTokenPayload,
    };
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
        const now = Math.floor(Date.now() / 1000);
        return {
          deviceId: devId,
          payload: {
            deviceId: devId,
            sub: devId,
            typ: 'dev-token',
            iat: now,
            exp: now + 3600,
            iss: this.issuer,
            aud: this.audience,
          },
        };
      }
    }

    throw new UnauthorizedException(
      'Device authentication required: provide signed device token via Authorization (Bearer or Device) or X-Device-Token header',
    );
  }
}
