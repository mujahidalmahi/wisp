# Wisp Device Credential Lifecycle & Provisioning Architecture

This document defines the security architecture, credential provisioning lifecycle, revocation mechanics, and secret rotation procedures for Amazon Fire TV devices interacting with the Wisp Backend API (`@wisp/backend`).

---

## 1. Threat Model & Design Goals

1. **Zero-Trust Device Identity:** Untrusted callers must never be permitted to claim or register arbitrary device IDs using static, reusable client-side secrets.
2. **Deterministic Ownership Boundaries:** Every household viewing profile and temporal bootstrap context is strictly bound to the authenticated `deviceId` extracted from cryptographically verified device tokens.
3. **Compromise Containment:** Compromise of an individual device must allow targeted revocation and secret rotation without requiring master key rotation across the entire fleet.
4. **Standard Cryptography:** Tokens adhere to RFC 7519 / RFC 7515 (HS256) with strict algorithm enforcement, issuer (`wisp-device-auth`), audience (`wisp-firetv-client`), subject, and expiration bounds.

---

## 2. Credential Lifecycle Overview

```
 [Operator / Factory Provisioning]
            │
            ▼
    POST /auth/pre-authorize ──────► Generates single-use enrollmentCode (15m TTL)
            │
            ▼
 [Fire TV Device Initialization]
            │
            ▼
    POST /auth/enroll ─────────────► Validates & atomically consumes enrollmentCode
            │                         Issues unique persistent deviceSecret (Epoch 1)
            │                         Issues initial signed JWT device token
            │
            ▼
 [Ongoing Playback & Operation]
            │
            ▼
    POST /auth/device-token ───────► Validates deviceSecret via constant-time comparison
                                      Issues refreshed JWT device token (30-day TTL)
```

---

## 3. Provisioning & Enrollment Flow

### 3.1 Pre-Authorization
1. An authenticated operator or automated provisioning system invokes `POST /api/v1/auth/pre-authorize` with `X-Operator-Token` and the target `deviceId`.
2. The server generates a high-entropy, 128-bit random enrollment code (`crypto.randomBytes(16).toString('hex')`) with an expiration window (default: 900 seconds / 15 minutes).
3. The enrollment code is transmitted to the device via secure channel (QR code, Bluetooth LE pairing, or factory provisioning).

### 3.2 Client Device Enrollment
1. The Fire TV device sends `POST /api/v1/auth/enroll` with `{ deviceId, enrollmentCode }`.
2. The backend:
   - Verifies the code exists for `deviceId` and is within the expiration window.
   - Atomically consumes the code to prevent replay attacks.
   - Derives a persistent `deviceSecret` unique to that device using HMAC-SHA256:
     $$\text{deviceSecret} = \text{HMAC-SHA256}(K_{\text{master}}, \text{"wisp-device-secret:"} \parallel \text{deviceId} \parallel \text{":epoch:"} \parallel \text{epoch})$$
   - Mints a signed JWT token containing standard claims (`sub: deviceId`, `deviceId`, `iss`, `aud`, `typ: "device-token"`).
3. The device securely stores `deviceSecret` in hardware-backed storage / Android Keystore.

---

## 4. Token Renewal Flow
1. Upon token expiration or app startup, the device calls `POST /api/v1/auth/device-token` with `{ deviceId, deviceSecret }`.
2. The server verifies `deviceSecret` against the expected secret using constant-time comparison (`crypto.timingSafeEqual`).
3. If verified and the device is not revoked, a refreshed JWT token is returned.

---

## 5. Compromise Recovery & Revocation

### 5.1 Individual Device Revocation
If a device is reported lost, stolen, or compromised:
1. Operator invokes `POST /api/v1/auth/revoke` with `{ deviceId, reason }`.
2. The device ID is added to the revocation registry.
3. Subsequent requests with existing tokens, renewal attempts with `deviceSecret`, or enrollment attempts for that device are immediately rejected with HTTP 401 Unauthorized.

### 5.2 Device Secret Epoch Rotation
If a device secret is suspected to be leaked but the physical device remains trusted:
1. Operator invokes `POST /api/v1/auth/rotate-secret` with `{ deviceId }`.
2. The device's epoch counter is incremented ($\text{epoch} \leftarrow \text{epoch} + 1$).
3. The previous `deviceSecret` becomes instantly invalid.
4. The operator issues a new single-use enrollment code via `POST /api/v1/auth/pre-authorize` to re-enroll the device.

---

## 6. Master Key Rotation (Zero-Downtime)

To rotate the server-side signing key without disrupting the active fleet:
1. Set `DEVICE_AUTH_PREVIOUS_SECRET` to the current `DEVICE_AUTH_SECRET`.
2. Update `DEVICE_AUTH_SECRET` to the new high-entropy secret.
3. Deploy the backend services.
4. During verification, `DeviceTokenService` checks `DEVICE_AUTH_SECRET` first; if signature verification fails, it falls back to `DEVICE_AUTH_PREVIOUS_SECRET`.
5. Devices renewing their tokens automatically receive tokens signed with the new secret.
6. Once the maximum token lifetime (30 days) has elapsed, remove `DEVICE_AUTH_PREVIOUS_SECRET`.
