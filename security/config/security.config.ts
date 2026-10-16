/**
 * Wisp Security Toolkit — Configuration, Threat Modeling & Risk Definitions
 */

export const Severity = {
  CRITICAL: 'CRITICAL',
  HIGH: 'HIGH',
  MEDIUM: 'MEDIUM',
  LOW: 'LOW',
  INFORMATIONAL: 'INFORMATIONAL',
} as const;
export type Severity = (typeof Severity)[keyof typeof Severity];

export const SecurityStatus = {
  PASS: 'PASS',
  FAIL: 'FAIL',
  WARNING: 'WARNING',
  NOT_APPLICABLE: 'NOT_APPLICABLE',
  MANUAL_REVIEW_REQUIRED: 'MANUAL_REVIEW_REQUIRED',
} as const;
export type SecurityStatus = (typeof SecurityStatus)[keyof typeof SecurityStatus];

export interface SecurityFinding {
  id: string;
  title: string;
  category: string;
  severity: Severity;
  cvssScore: number;
  cvssVector: string;
  affectedComponent: string;
  affectedFile: string;
  affectedEndpoint?: string;
  description: string;
  attackScenario: string;
  evidence: string;
  rootCause: string;
  exploitability: string;
  impact: string;
  recommendedRemediation: string;
  validationTest: string;
  status: 'FIXED' | 'VERIFIED' | 'MITIGATED' | 'ACCEPTED_RISK';
}

export const SECURITY_CONFIG = {
  maxRequestPayloadBytes: 16 * 1024, // 16 KB strict limit
  maxPromptLengthChars: 300,
  rateLimitWindowSec: 60,
  rateLimitMaxRequests: 30,
  allowedCorsOrigins: [
    'http://localhost:3000',
    'http://10.0.2.2:3000',
    'http://127.0.0.1:3000',
    'http://localhost:8081',
  ],
  requiredSecurityHeaders: [
    'content-security-policy',
    'x-content-type-options',
    'x-frame-options',
    'referrer-policy',
    'permissions-policy',
  ],
  sensitiveQueryParams: [
    'deviceid',
    'device_id',
    'profileid',
    'profile_id',
    'episodeid',
    'episode_id',
    'playbackms',
    'playbackpositionms',
    'lookbackms',
    'cursor',
  ],
};
