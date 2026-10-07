import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { SecurityStatus, Severity } from '../config/security.config.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface StaticAnalysisResult {
  suite: string;
  status: SecurityStatus;
  scannedFilesCount: number;
  findings: Array<{
    file: string;
    line: number;
    rule: string;
    severity: Severity;
    sample: string;
  }>;
  durationMs: number;
}

const STATIC_RULES: Array<{
  name: string;
  pattern: RegExp;
  severity: Severity;
  fileFilter?: (filePath: string) => boolean;
}> = [
  {
    name: 'Unsafe Dynamic Code Execution (eval)',
    pattern: /\beval\s*\(/,
    severity: Severity.CRITICAL,
  },
  {
    name: 'Unsafe Dynamic Function Constructor',
    pattern: /\bnew\s+Function\s*\(/,
    severity: Severity.CRITICAL,
  },
  {
    name: 'Insecure Randomness for Security Tokens (Math.random)',
    pattern: /Math\.random\(\)\.toString\((?:36|16)\)/,
    severity: Severity.HIGH,
    fileFilter: (p) => !p.includes('.test.') && !p.includes('testing/'),
  },
  {
    name: 'Unsafe Child Process Execution (exec/spawn shell: true)',
    pattern: /(?:exec|execSync)\s*\([^,)]*shell:\s*true/,
    severity: Severity.CRITICAL,
  },
  {
    name: 'Raw SQL String Interpolation in Repository/Service',
    pattern: /(?:query|execute|rpc)\s*\(\s*`[^`]*\$\{[^}]+\}/,
    severity: Severity.HIGH,
  },
];

const IGNORED_PATHS = ['node_modules', 'dist', '.git', 'reports', 'coverage', '.system_generated'];

export function runStaticAnalysis(rootDir = path.resolve(__dirname, '../../')): StaticAnalysisResult {
  const start = Date.now();
  const findings: StaticAnalysisResult['findings'] = [];
  let scannedFiles = 0;

  function walk(dir: string) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (IGNORED_PATHS.some((p) => entry.name.includes(p))) continue;
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (entry.isFile() && (entry.name.endsWith('.ts') || entry.name.endsWith('.js') || entry.name.endsWith('.sql'))) {
        scannedFiles++;
        const relPath = path.relative(rootDir, fullPath).replace(/\\/g, '/');
        try {
          const content = fs.readFileSync(fullPath, 'utf8');
          const lines = content.split('\n');

          lines.forEach((lineText, idx) => {
            for (const rule of STATIC_RULES) {
              if (rule.fileFilter && !rule.fileFilter(relPath)) continue;
              if (rule.pattern.test(lineText)) {
                // Ignore self-references in security scanners
                if (relPath.includes('security/')) continue;

                findings.push({
                  file: relPath,
                  line: idx + 1,
                  rule: rule.name,
                  severity: rule.severity,
                  sample: lineText.trim().slice(0, 100),
                });
              }
            }
          });

          // SQL-specific audit: Check search_path locking on SECURITY DEFINER functions
          if (entry.name.endsWith('.sql')) {
            const secDefinerMatches = content.match(/create (?:or replace )?function [^;]+security definer[^;]+;/gi) || [];
            for (const fnDecl of secDefinerMatches) {
              if (!fnDecl.toLowerCase().includes('set search_path = public') && !fnDecl.toLowerCase().includes('set search_path to public')) {
                findings.push({
                  file: relPath,
                  line: 1,
                  rule: 'Missing search_path lock on PostgreSQL SECURITY DEFINER function',
                  severity: Severity.HIGH,
                  sample: fnDecl.slice(0, 80).replace(/\s+/g, ' '),
                });
              }
            }
          }
        } catch {
          // Inaccessible file
        }
      }
    }
  }

  walk(rootDir);

  const durationMs = Date.now() - start;
  const status =
    findings.filter((f) => f.severity === Severity.CRITICAL).length > 0
      ? SecurityStatus.FAIL
      : findings.length > 0
        ? SecurityStatus.WARNING
        : SecurityStatus.PASS;

  return {
    suite: 'Static Code & SQL Vulnerability Analyzer',
    status,
    scannedFilesCount: scannedFiles,
    findings,
    durationMs,
  };
}
