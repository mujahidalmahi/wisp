import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { SecurityStatus, Severity } from '../config/security.config.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface DependencyScanResult {
  suite: string;
  status: SecurityStatus;
  workspacesAudited: string[];
  findings: Array<{
    package: string;
    version: string;
    workspace: string;
    issue: string;
    severity: Severity;
    remediation: string;
  }>;
  durationMs: number;
}

export function runDependencyScan(rootDir = path.resolve(__dirname, '../../')): DependencyScanResult {
  const start = Date.now();
  const findings: DependencyScanResult['findings'] = [];
  const workspaces = ['', 'backend', 'frontend', 'ai-engine', 'cloudflare'];

  // Check lockfile presence
  const lockfilePath = path.join(rootDir, 'package-lock.json');
  if (!fs.existsSync(lockfilePath)) {
    findings.push({
      package: 'lockfile',
      version: 'none',
      workspace: 'root',
      issue: 'package-lock.json is missing, risking non-deterministic supply-chain builds.',
      severity: Severity.HIGH,
      remediation: 'Run npm install to generate deterministic lockfile.',
    });
  }

  for (const ws of workspaces) {
    const pkgPath = path.join(rootDir, ws, 'package.json');
    if (!fs.existsSync(pkgPath)) continue;

    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
      const allDeps = {
        ...(pkg.dependencies || {}),
        ...(pkg.devDependencies || {}),
      };

      for (const [dep, version] of Object.entries(allDeps)) {
        const verStr = String(version);
        // Disallow dangerous wildcards in production dependencies
        if (pkg.dependencies && pkg.dependencies[dep]) {
          if (verStr === '*' || verStr === 'latest') {
            // Local workspace wildcards are acceptable
            if (dep !== '@wisp/ai-engine') {
              findings.push({
                package: dep,
                version: verStr,
                workspace: ws || 'root',
                issue: `Unpinned dependency "${dep}: ${verStr}" creates supply-chain risk.`,
                severity: Severity.MEDIUM,
                remediation: `Pin ${dep} to an exact or semver-bounded range (^ or ~).`,
              });
            }
          }
        }
      }
    } catch (err: any) {
      findings.push({
        package: ws || 'root',
        version: 'unknown',
        workspace: ws || 'root',
        issue: `Malformed package.json: ${err?.message}`,
        severity: Severity.HIGH,
        remediation: 'Fix JSON syntax in package.json.',
      });
    }
  }

  const durationMs = Date.now() - start;
  const status =
    findings.some((f) => f.severity === Severity.CRITICAL || f.severity === Severity.HIGH)
      ? SecurityStatus.FAIL
      : findings.length > 0
        ? SecurityStatus.WARNING
        : SecurityStatus.PASS;

  return {
    suite: 'Dependency & Supply-Chain Security Scanner',
    status,
    workspacesAudited: workspaces.map((w) => w || 'root'),
    findings,
    durationMs,
  };
}
