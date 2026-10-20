import { EnvConfig } from '../config/env.ts';
import type { DeviceAuthToken } from '../types/wisp.ts';

function isTestEnvironment(): boolean {
  return typeof process !== 'undefined' && (
    process.env?.NODE_ENV === 'test' ||
    process.argv?.some((arg) => arg.includes('test'))
  );
}

export class DeviceAuthService {
  private static instance: DeviceAuthService;
  private currentDeviceId: string = 'firetv-living-room-001';
  private cachedToken: DeviceAuthToken | null = null;
  private isEnrolling: boolean = false;

  private constructor() {}

  public static getInstance(): DeviceAuthService {
    if (!DeviceAuthService.instance) {
      DeviceAuthService.instance = new DeviceAuthService();
    }
    return DeviceAuthService.instance;
  }

  public getDeviceId(): string {
    return this.currentDeviceId;
  }

  public setDeviceId(deviceId: string): void {
    if (this.currentDeviceId !== deviceId) {
      this.currentDeviceId = deviceId;
      this.cachedToken = null;
    }
  }

  /**
   * Manually sets or mocks an active device token for testing/development.
   */
  public setDeviceToken(token: string, expiresAt: number = Math.floor(Date.now() / 1000) + 3600): void {
    this.cachedToken = {
      deviceId: this.currentDeviceId,
      token,
      deviceSecret: 'wisp-mock-device-secret',
      expiresAt,
    };
  }

  /**
   * Returns a valid JWT device token, enrolling or refreshing as necessary.
   * If backend is unreachable, gracefully returns null so caller can fall back.
   */
  public async getValidToken(): Promise<string | null> {
    const now = Math.floor(Date.now() / 1000);

    // Return cached token if valid with 60-second buffer
    if (this.cachedToken && this.cachedToken.expiresAt > now + 60) {
      return this.cachedToken.token;
    }

    if (this.isEnrolling) {
      // Prevent thundering herd enrollment
      return this.cachedToken?.token || null;
    }

    this.isEnrolling = true;
    try {
      const token = await this.provisionOrRefreshToken();
      return token;
    } catch {
      return null;
    } finally {
      this.isEnrolling = false;
    }
  }

  /**
   * Prepares standard headers including cryptographic device bearer token and device ID.
   */
  public async getAuthHeaders(): Promise<Record<string, string>> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-Device-Id': this.currentDeviceId,
      'X-FireTV-Device-Id': this.currentDeviceId,
    };

    const token = await this.getValidToken();
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
      headers['X-Device-Token'] = token;
    }

    return headers;
  }

  private async provisionOrRefreshToken(): Promise<string | null> {
    const deviceId = this.currentDeviceId;
    const timeoutBudget = isTestEnvironment() ? 250 : 1500;

    // 1. If we have a cached deviceSecret, attempt token renewal
    if (this.cachedToken?.deviceSecret) {
      const renewController = new AbortController();
      const renewTimer = setTimeout(() => renewController.abort(), timeoutBudget);

      try {
        const renewUrl = `${EnvConfig.apiBaseUrl}/auth/device-token`;
        const res = await fetch(renewUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            deviceId,
            deviceSecret: this.cachedToken.deviceSecret,
          }),
          signal: renewController.signal,
        });

        if (res.ok) {
          const data = (await res.json()) as any;
          this.cachedToken = {
            deviceId,
            token: data.token,
            deviceSecret: data.deviceSecret || this.cachedToken.deviceSecret,
            expiresAt: Math.floor(Date.now() / 1000) + (data.expires_in || 2592000),
          };
          return this.cachedToken.token;
        }
      } catch {
        // Fall back to enrollment
      } finally {
        clearTimeout(renewTimer);
      }
    }

    // 2. Initial enrollment using non-production development fleet enrollment key
    const enrollController = new AbortController();
    const enrollTimer = setTimeout(() => enrollController.abort(), timeoutBudget);

    try {
      const enrollUrl = `${EnvConfig.apiBaseUrl}/auth/enroll`;
      const res = await fetch(enrollUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          deviceId,
          enrollmentKey: 'wisp-dev-device-enrollment-secret-2026',
        }),
        signal: enrollController.signal,
      });

      if (res.ok) {
        const data = (await res.json()) as any;
        this.cachedToken = {
          deviceId,
          token: data.token,
          deviceSecret: data.deviceSecret,
          expiresAt: Math.floor(Date.now() / 1000) + (data.expires_in || 2592000),
        };
        return this.cachedToken.token;
      }
    } catch {
      // Backend offline or networking error -> return null so caller uses standalone AI engine fallback
    } finally {
      clearTimeout(enrollTimer);
    }

    return null;
  }
}
