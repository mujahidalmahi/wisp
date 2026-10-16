import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { SecurityStatus, Severity } from '../config/security.config.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface ConfigAuditResult {
  suite: string;
  status: SecurityStatus;
  checksPassed: number;
  checksFailed: number;
  findings: Array<{
    target: string;
    check: string;
    severity: Severity;
    message: string;
  }>;
  durationMs: number;
}

export function runConfigurationAudit(rootDir = path.resolve(__dirname, '../../')): ConfigAuditResult {
  const start = Date.now();
  const findings: ConfigAuditResult['findings'] = [];
  let checksPassed = 0;
  let checksFailed = 0;

  // 1. Verify frontend/.env.example has ZERO server-side credentials (Non-Negotiable Rule 5)
  const frontendEnvPath = path.join(rootDir, 'frontend', '.env.example');
  if (fs.existsSync(frontendEnvPath)) {
    const content = fs.readFileSync(frontendEnvPath, 'utf8');
    const forbiddenKeys = [
      'GROQ_API_KEY',
      'GEMINI_API_KEY',
      'OPENROUTER_API_KEY',
      'SUPABASE_SERVICE_ROLE_KEY',
      'INTERNAL_OPERATOR_TOKEN',
      'DEVICE_AUTH_SECRET',
    ];

    for (const key of forbiddenKeys) {
      if (content.includes(key)) {
        checksFailed++;
        findings.push({
          target: 'frontend/.env.example',
          check: `Client Credential Isolation: ${key}`,
          severity: Severity.CRITICAL,
          message: `Forbidden server-side secret '${key}' found in Fire TV frontend environment template!`,
        });
      } else {
        checksPassed++;
      }
    }
  }

  // 2. Verify environment validator rejects demo fallback & wildcard CORS in production
  const validatorPath = path.join(rootDir, 'backend', 'src', 'common', 'config', 'environment.validator.ts');
  if (fs.existsSync(validatorPath)) {
    const content = fs.readFileSync(validatorPath, 'utf8');
    if (content.includes('ENABLE_DEMO_FALLBACK') && content.includes('NODE_ENV === \'production\'')) {
      checksPassed++;
    } else {
      checksFailed++;
      findings.push({
        target: 'backend/src/common/config/environment.validator.ts',
        check: 'Production Demo Fallback Guard',
        severity: Severity.HIGH,
        message: 'Missing strict production check forbidding ENABLE_DEMO_FALLBACK in production mode.',
      });
    }

    if (content.includes('CORS_ALLOWED_ORIGINS') && content.includes('wildcard')) {
      checksPassed++;
    } else {
      checksFailed++;
      findings.push({
        target: 'backend/src/common/config/environment.validator.ts',
        check: 'Production CORS Wildcard Guard',
        severity: Severity.HIGH,
        message: 'Missing strict production check forbidding wildcard "*" in CORS_ALLOWED_ORIGINS.',
      });
    }
  }

  // 3. Verify security headers middleware enforces CSP, nosniff, frameguard, Permissions-Policy
  const headersConfigPath = path.join(rootDir, 'backend', 'src', 'common', 'security', 'security-headers.config.ts');
  if (fs.existsSync(headersConfigPath)) {
    const content = fs.readFileSync(headersConfigPath, 'utf8');
    const requiredDirectives = ['contentSecurityPolicy', 'noSniff', 'frameguard', 'Permissions-Policy'];
    for (const dir of requiredDirectives) {
      if (content.includes(dir)) {
        checksPassed++;
      } else {
        checksFailed++;
        findings.push({
          target: 'backend/src/common/security/security-headers.config.ts',
          check: `HTTP Security Header: ${dir}`,
          severity: Severity.MEDIUM,
          message: `Security header middleware does not explicitly enforce ${dir}.`,
        });
      }
    }
  }

  // 4. Verify 16 KB request payload limit in backend main.ts
  const mainPath = path.join(rootDir, 'backend', 'src', 'main.ts');
  if (fs.existsSync(mainPath)) {
    const content = fs.readFileSync(mainPath, 'utf8');
    if (content.includes("limit: '16kb'") && content.includes('bodyParser: false')) {
      checksPassed++;
    } else {
      checksFailed++;
      findings.push({
        target: 'backend/src/main.ts',
        check: '16 KB Payload Limit Guard',
        severity: Severity.HIGH,
        message: 'NestJS bootstrap does not enforce strict 16 KB payload boundary on bodyParser.',
      });
    }
  }

  const durationMs = Date.now() - start;
  const status =
    findings.filter((f) => f.severity === Severity.CRITICAL || f.severity === Severity.HIGH).length > 0
      ? SecurityStatus.FAIL
      : findings.length > 0
        ? SecurityStatus.WARNING
        : SecurityStatus.PASS;

  return {
    suite: 'Configuration & Security Headers Audit',
    status,
    checksPassed,
    checksFailed,
    findings,
    durationMs,
  };
}
