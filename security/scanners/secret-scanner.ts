import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { SecurityStatus, Severity } from '../config/security.config.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface SecretScanResult {
  suite: string;
  status: SecurityStatus;
  scannedFilesCount: number;
  findings: Array<{
    file: string;
    line: number;
    rule: string;
    redactedMatch: string;
    severity: Severity;
  }>;
  durationMs: number;
}

const SECRET_PATTERNS: Array<{ name: string; pattern: RegExp; severity: Severity }> = [
  {
    name: 'Private RSA/EC/PGP Key',
    pattern: /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/,
    severity: Severity.CRITICAL,
  },
  {
    name: 'Live Groq API Key',
    pattern: /gsk_[a-zA-Z0-9]{30,}/,
    severity: Severity.CRITICAL,
  },
  {
    name: 'Live OpenRouter / OpenAI Key',
    pattern: /sk-(?:or-v1-)?[a-zA-Z0-9]{32,}/,
    severity: Severity.CRITICAL,
  },
  {
    name: 'Google Gemini Studio Live Key',
    pattern: /AIzaSy[a-zA-Z0-9_-]{33}/,
    severity: Severity.CRITICAL,
  },
  {
    name: 'Hardcoded High-Entropy JWT Secret in Production',
    pattern: /(?:jwt_secret|jwtSecret|device_auth_secret)\s*[:=]\s*['"][a-zA-Z0-9@#$%^&*-]{16,}['"]/i,
    severity: Severity.HIGH,
  },
];

const IGNORED_DIRS = new Set([
  'node_modules',
  'dist',
  '.git',
  '.system_generated',
  'reports',
  'coverage',
]);

const ALLOWED_EXAMPLE_FILES = new Set(['.env.example', 'frontend/.env.example', 'SECURITY.md']);

export function runSecretScan(rootDir = path.resolve(__dirname, '../../')): SecretScanResult {
  const start = Date.now();
  const findings: SecretScanResult['findings'] = [];
  let scannedFiles = 0;

  function redact(str: string): string {
    if (str.length <= 8) return '********';
    return `${str.slice(0, 4)}...[REDACTED]...${str.slice(-4)}`;
  }

  function walk(dir: string) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (IGNORED_DIRS.has(entry.name)) continue;
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (entry.isFile()) {
        const relPath = path.relative(rootDir, fullPath).replace(/\\/g, '/');
        // Skip template example files and local gitignored environment files
        if (
          ALLOWED_EXAMPLE_FILES.has(relPath) ||
          relPath.endsWith('.env.example') ||
          relPath.endsWith('/.env') ||
          relPath === '.env' ||
          relPath.includes('.env.local')
        ) {
          continue;
        }

        scannedFiles++;
        try {
          const content = fs.readFileSync(fullPath, 'utf8');
          const lines = content.split('\n');

          lines.forEach((lineText, idx) => {
            // Ignore mock/dummy test fixtures
            if (
              lineText.includes('dummy') ||
              lineText.includes('test-secret') ||
              lineText.includes('wisp-dev-') ||
              lineText.includes('untrusted') ||
              lineText.includes('mock')
            ) {
              return;
            }

            for (const { name, pattern, severity } of SECRET_PATTERNS) {
              const match = lineText.match(pattern);
              if (match) {
                findings.push({
                  file: relPath,
                  line: idx + 1,
                  rule: name,
                  redactedMatch: redact(match[0]),
                  severity,
                });
              }
            }
          });
        } catch {
          // Binary or inaccessible file
        }
      }
    }
  }

  // 1. Verify .gitignore blocks actual secrets
  const gitignorePath = path.join(rootDir, '.gitignore');
  if (fs.existsSync(gitignorePath)) {
    const gitignoreContent = fs.readFileSync(gitignorePath, 'utf8');
    const requiredPatterns = ['.env', '.dev.vars'];
    for (const req of requiredPatterns) {
      if (!gitignoreContent.includes(req)) {
        findings.push({
          file: '.gitignore',
          line: 1,
          rule: `Missing ${req} exclusion in .gitignore`,
          redactedMatch: req,
          severity: Severity.HIGH,
        });
      }
    }
  }

  walk(rootDir);

  const durationMs = Date.now() - start;
  const status =
    findings.filter((f) => f.severity === Severity.CRITICAL || f.severity === Severity.HIGH).length > 0
      ? SecurityStatus.FAIL
      : findings.length > 0
        ? SecurityStatus.WARNING
        : SecurityStatus.PASS;

  return {
    suite: 'Secret & Credential Security Scanner',
    status,
    scannedFilesCount: scannedFiles,
    findings,
    durationMs,
  };
}
