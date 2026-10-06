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

interface EnrollmentChallenge {
  deviceId: string;
  code: string;
  expiresAt: number;
  consumed: boolean;
}

@Injectable()
export class DeviceTokenService implements OnModuleInit {
  private readonly logger = new Logger(DeviceTokenService.name);
  private secretKey: string;
  private previousSecretKey?: string;
  private readonly issuer: string;
  private readonly audience: string;
  private readonly enrollmentSecret?: string;

  // In-memory revocation registry and device secret epoch tracking (Issue 7)
  private readonly revokedDevices = new Set<string>();
  private readonly deviceEpochs = new Map<string, number>();

  // Single-use pre-authorized device enrollment challenges (Issue 1)
  private readonly enrollmentChallenges = new Map<string, EnrollmentChallenge>();

  constructor() {
    this.secretKey = this.resolveSecretKey();
    this.previousSecretKey = this.resolvePreviousSecretKey();
    this.issuer = process.env.JWT_ISSUER?.trim() || 'wisp-device-auth';
    this.audience = process.env.JWT_AUDIENCE?.trim() || 'wisp-firetv-client';
    this.enrollmentSecret =
      process.env.DEVICE_ENROLLMENT_SECRET?.trim() ||
      (process.env.NODE_ENV !== 'production'
        ? 'wisp-dev-device-enrollment-secret-2026'
        : undefined);
  }

  onModuleInit() {
    const isProduction = process.env.NODE_ENV === 'production';
    if (
      isProduction &&
      !process.env.DEVICE_AUTH_SECRET &&
      !process.env.JWT_SECRET
    ) {
      throw new Error(
        'CRITICAL CONFIGURATION ERROR: DEVICE_AUTH_SECRET (or JWT_SECRET) is required in production mode for device authentication.',
      );
    }
  }

  private resolveSecretKey(): string {
    const configured =
      process.env.DEVICE_AUTH_SECRET ||
      process.env.JWT_SECRET;
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

  // --------------------------------------------------------------------------
  // Device Revocation & Credential Lifecycle (Issue 7)
  // --------------------------------------------------------------------------

  /**
   * Revokes an individual device, instantly invalidating all its active tokens and secrets.
   */
  revokeDevice(deviceId: string, reason = 'Operator action'): void {
    const cleanId = (deviceId || '').trim();
    if (cleanId) {
      this.revokedDevices.add(cleanId);
      this.logger.warn(`Device revoked: ${cleanId} (Reason: ${reason})`);
    }
  }

  /**
   * Reinstates a revoked device.
   */
  unrevokeDevice(deviceId: string): void {
    this.revokedDevices.delete((deviceId || '').trim());
  }

  /**
   * Checks whether a device is currently revoked.
   */
  isDeviceRevoked(deviceId: string): boolean {
    return this.revokedDevices.has((deviceId || '').trim());
  }

  /**
   * Rotates a device's secret epoch without affecting other devices.
   */
  rotateDeviceSecret(deviceId: string): number {
    const cleanId = (deviceId || '').trim();
    const nextEpoch = (this.deviceEpochs.get(cleanId) || 1) + 1;
    this.deviceEpochs.set(cleanId, nextEpoch);
    this.logger.log(`Rotated device secret epoch for ${cleanId} to ${nextEpoch}`);
    return nextEpoch;
  }

  // --------------------------------------------------------------------------
  // Pre-Authorized Device Challenges (Issue 1)
  // --------------------------------------------------------------------------

  /**
   * Pre-authorizes a device with a single-use enrollment code (Operator-gated).
   * Prevents untrusted clients from self-registering arbitrary device IDs.
   */
  createEnrollmentChallenge(
    deviceId: string,
    expiresInSeconds = 900,
  ): { deviceId: string; enrollmentCode: string; expiresAt: number } {
    const cleanId = (deviceId || '').trim();
    if (!cleanId || cleanId.length < 3) {
      throw new UnauthorizedException('Invalid device identifier');
    }
    const code = crypto.randomBytes(16).toString('hex');
    const expiresAt = Date.now() + expiresInSeconds * 1000;
    this.enrollmentChallenges.set(cleanId, {
      deviceId: cleanId,
      code,
      expiresAt,
      consumed: false,
    });
    return { deviceId: cleanId, enrollmentCode: code, expiresAt };
  }

  /**
   * Validates and consumes a single-use enrollment code for deviceId.
   */
  consumeEnrollmentCode(deviceId: string, code: string): boolean {
    const cleanId = (deviceId || '').trim();
    const challenge = this.enrollmentChallenges.get(cleanId);
    if (!challenge || challenge.consumed) return false;
    if (Date.now() > challenge.expiresAt) {
      this.enrollmentChallenges.delete(cleanId);
      return false;
    }
    const codeBuf = Buffer.from(code.trim());
    const expBuf = Buffer.from(challenge.code);
    if (codeBuf.length !== expBuf.length || !crypto.timingSafeEqual(codeBuf, expBuf)) {
      return false;
    }
    // Atomically consume code to prevent reuse
    challenge.consumed = true;
    this.enrollmentChallenges.delete(cleanId);
    return true;
  }

  // --------------------------------------------------------------------------
  // Cryptographic Secret Derivation & Verification
  // --------------------------------------------------------------------------

  /**
   * Deterministically derives a high-entropy device secret for a given deviceId
   * using HMAC-SHA256 with the master server secret and device epoch.
   */
  deriveDeviceSecret(deviceId: string): string {
    const cleanId = (deviceId || '').trim();
    if (!cleanId || cleanId.length < 3) {
      throw new UnauthorizedException('deviceId must be a non-empty string with at least 3 characters');
    }
    const epoch = this.deviceEpochs.get(cleanId) || 1;
    return crypto
      .createHmac('sha256', this.secretKey)
      .update(`wisp-device-secret:${cleanId}:epoch:${epoch}`)
      .digest('hex');
  }

  /**
   * Performs constant-time verification of a candidate device secret for deviceId.
   */
  verifyDeviceSecret(deviceId: string, candidateSecret: string): boolean {
    if (!candidateSecret || typeof candidateSecret !== 'string') return false;
    if (this.isDeviceRevoked(deviceId)) return false;
    const expected = this.deriveDeviceSecret(deviceId);
    const candBuf = Buffer.from(candidateSecret.trim());
    const expBuf = Buffer.from(expected);
    if (candBuf.length !== expBuf.length) return false;
    return crypto.timingSafeEqual(candBuf, expBuf);
  }

  /**
   * Performs constant-time verification of a candidate fleet enrollment key.
   * Only permitted in non-production environments for local development.
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
   * - Enrolling: requires single-use enrollmentCode or authenticated operator bypass.
   *   (In non-production dev mode only, a matching enrollmentKey is accepted for development).
   * - Renewal: requires device's valid deviceSecret.
   * Rejects arbitrary device IDs, reused codes, and revoked devices.
   */
  authenticateAndIssueToken(
    deviceId: string,
    credentials: {
      deviceSecret?: string;
      enrollmentCode?: string;
      enrollmentKey?: string;
      isOperatorAuthorized?: boolean;
    },
    expiresInSeconds: number = 30 * 24 * 3600,
  ): DeviceEnrollmentResult {
    const cleanId = (deviceId || '').trim();
    if (!cleanId || cleanId.length < 3) {
      throw new UnauthorizedException('Invalid device identifier');
    }

    if (this.isDeviceRevoked(cleanId)) {
      throw new UnauthorizedException(`Device '${cleanId}' has been revoked`);
    }

    const isProduction = process.env.NODE_ENV === 'production';

    // 1. Initial Enrollment Path: single-use pre-authorized code, operator authority, or dev fleet key
    let isEnrolling = false;
    if (credentials.isOperatorAuthorized) {
      isEnrolling = true;
    } else if (credentials.enrollmentCode) {
      const codeValid = this.consumeEnrollmentCode(cleanId, credentials.enrollmentCode);
      if (!codeValid) {
        throw new UnauthorizedException(
          'Device enrollment failed: invalid, expired, or already-consumed enrollment code',
        );
      }
      isEnrolling = true;
    } else if (credentials.enrollmentKey) {
      if (isProduction) {
        throw new UnauthorizedException(
          'Shared fleet enrollment keys are strictly forbidden in production. Use pre-authorized device enrollment codes or operator enrollment.',
        );
      }
      if (this.verifyEnrollmentKey(credentials.enrollmentKey)) {
        isEnrolling = true;
      } else {
        throw new UnauthorizedException('Invalid device enrollment key');
      }
    }

    // 2. Token Renewal Path: verified deviceSecret
    const hasValidDeviceSecret = credentials.deviceSecret
      ? this.verifyDeviceSecret(cleanId, credentials.deviceSecret)
      : false;

    if (!isEnrolling && !hasValidDeviceSecret) {
      throw new UnauthorizedException(
        'Device authentication failed: valid enrollmentCode (for new devices) or deviceSecret (for renewals) required',
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
   * with standard RFC 7519 claims: sub, deviceId, iss, aud, typ, iat, exp.
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
   * Strict validation:
   * - Enforces algorithm HS256 (rejects none or asymmetric).
   * - Enforces issuer, audience, typ, deviceId, sub.
   * - Enforces expiration with 60s clock tolerance.
   * - Checks revocation registry.
   * - Supports key rotation via previousSecretKey.
   * - UNSAFE SUPABASE JWT FALLBACK COMPLETELY REMOVED (Issue 2).
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

      if (!decoded) {
        throw new UnauthorizedException('Invalid device token cryptographic signature');
      }
    }

    // Validate standard claims
    if (decoded.typ !== 'device-token') {
      throw new UnauthorizedException('Invalid token type claim: expected device-token');
    }

    const deviceId = (decoded.deviceId || decoded.sub || '').toString().trim();
    if (!deviceId || deviceId.length < 3) {
      throw new UnauthorizedException('Device token does not contain a valid device identity claim');
    }

    if (decoded.sub !== deviceId) {
      throw new UnauthorizedException('Claim mismatch: subject does not match deviceId');
    }

    if (typeof decoded.iat !== 'number' || decoded.iat <= 0) {
      throw new UnauthorizedException('Device token missing valid issued-at (iat) claim');
    }

    // Check device revocation status (Issue 7)
    if (this.isDeviceRevoked(deviceId)) {
      throw new UnauthorizedException(`Device '${deviceId}' has been revoked`);
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
    if (!isProduction && allowInsecureDev) {
      const rawHeader = request.headers['x-firetv-device-id'] || request.headers['x-device-id'];
      if (typeof rawHeader === 'string') {
        const devId = rawHeader.trim();
        if (devId.length >= 3) {
          if (this.isDeviceRevoked(devId)) {
            throw new UnauthorizedException(`Device '${devId}' has been revoked`);
          }
          const now = Math.floor(Date.now() / 1000);
          return {
            deviceId: devId,
            payload: {
              deviceId: devId,
              sub: devId,
              typ: 'device-token',
              iat: now,
              exp: now + 3600,
              iss: this.issuer,
              aud: this.audience,
            },
          };
        }
      }
    }

    throw new UnauthorizedException(
      'Device authentication required: provide signed device token via Authorization (Bearer or Device) or X-Device-Token header',
    );
  }
}
