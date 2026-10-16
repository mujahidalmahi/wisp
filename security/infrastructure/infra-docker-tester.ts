import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { SecurityStatus, Severity } from '../config/security.config.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface InfraAuditResult {
  suite: string;
  status: SecurityStatus;
  checksRun: number;
  checksPassed: number;
  checksFailed: number;
  findings: Array<{ target: string; issue: string; severity: Severity }>;
  durationMs: number;
}

export function runInfrastructureAudit(rootDir = path.resolve(__dirname, '../../')): InfraAuditResult {
  const start = Date.now();
  const findings: InfraAuditResult['findings'] = [];
  let checksRun = 0;
  let checksPassed = 0;
  let checksFailed = 0;

  // 1. Audit GitHub Actions CI Workflow (.github/workflows/ci.yml)
  const ciWorkflowPath = path.join(rootDir, '.github', 'workflows', 'ci.yml');
  checksRun++;
  if (fs.existsSync(ciWorkflowPath)) {
    const ciContent = fs.readFileSync(ciWorkflowPath, 'utf8');

    // Check for hardcoded credentials in workflow
    const secretKeywords = ['gsk_', 'sk-or-', 'AIzaSy'];
    for (const kw of secretKeywords) {
      if (ciContent.includes(kw)) {
        checksFailed++;
        findings.push({
          target: '.github/workflows/ci.yml',
          issue: `Found potential hardcoded secret pattern "${kw}" in CI workflow.`,
          severity: Severity.CRITICAL,
        });
      }
    }

    // Check that tests and typechecks are run
    if (ciContent.includes('npm run test') || ciContent.includes('npm test') || ciContent.includes('node --test')) {
      checksPassed++;
    } else {
      checksFailed++;
      findings.push({
        target: '.github/workflows/ci.yml',
        issue: 'CI workflow does not explicitly invoke automated tests.',
        severity: Severity.MEDIUM,
      });
    }
  } else {
    checksFailed++;
    findings.push({
      target: '.github/workflows/ci.yml',
      issue: 'Missing CI workflow file.',
      severity: Severity.LOW,
    });
  }

  // 2. Audit Cloudflare Wrangler Configuration (cloudflare/wrangler.toml)
  const wranglerPath = path.join(rootDir, 'cloudflare', 'wrangler.toml');
  checksRun++;
  if (fs.existsSync(wranglerPath)) {
    const wranglerContent = fs.readFileSync(wranglerPath, 'utf8');
    // Ensure no API keys or service role secrets in plaintext in wrangler.toml
    const forbiddenWranglerKeys = ['GROQ_API_KEY', 'GEMINI_API_KEY', 'SUPABASE_SERVICE_ROLE_KEY'];
    for (const key of forbiddenWranglerKeys) {
      if (wranglerContent.includes(key)) {
        checksFailed++;
        findings.push({
          target: 'cloudflare/wrangler.toml',
          issue: `Plaintext secret ${key} configured in wrangler.toml; use wrangler secret put instead.`,
          severity: Severity.HIGH,
        });
      }
    }
    checksPassed++;
  }

  const durationMs = Date.now() - start;
  const status =
    findings.filter((f) => f.severity === Severity.CRITICAL || f.severity === Severity.HIGH).length > 0
      ? SecurityStatus.FAIL
      : findings.length > 0
        ? SecurityStatus.WARNING
        : SecurityStatus.PASS;

  return {
    suite: 'Infrastructure, CI/CD & Container Security Audit',
    status,
    checksRun,
    checksPassed,
    checksFailed,
    findings,
    durationMs,
  };
}
