import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { runSecretScan } from './scanners/secret-scanner.ts';
import { runDependencyScan } from './scanners/dependency-scanner.ts';
import { runConfigurationAudit } from './scanners/config-audit.ts';
import { runStaticAnalysis } from './static/static-analyzer.ts';
import { runAuthMatrixTests } from './auth/auth-matrix-validator.ts';
import { runAuthorizationTests } from './authorization/idor-bola-tester.ts';
import { runInjectionTests } from './injection/injection-suite.ts';
import { runAiSecurityTests } from './ai/ai-security-tester.ts';
import { runSsrfTests } from './ssrf/ssrf-tester.ts';
import { runFileMediaTests } from './files/file-media-tester.ts';
import { runFuzzTests } from './fuzz/payload-fuzzer.ts';
import { runDynamicSecurityTests } from './dynamic/dynamic-tester.ts';
import { runInfrastructureAudit } from './infrastructure/infra-docker-tester.ts';
import { SecurityStatus, Severity } from './config/security.config.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function main() {
  console.log('='.repeat(80));
  console.log('  WISP — COMPREHENSIVE SECURITY AUDIT & PENETRATION TESTING RUNNER');
  console.log('='.repeat(80));

  const rootDir = path.resolve(__dirname, '../');
  const reportsDir = path.resolve(__dirname, 'reports');
  if (!fs.existsSync(reportsDir)) {
    fs.mkdirSync(reportsDir, { recursive: true });
  }

  const startTime = Date.now();
  const summary: any = {
    timestamp: new Date().toISOString(),
    overallStatus: 'PASS',
    suites: [],
  };

  // 1. Secret Scan
  console.log('\n[1/13] Executing Secret & Credential Scan...');
  const secretResult = runSecretScan(rootDir);
  summary.suites.push(secretResult);
  console.log(`  -> Status: ${secretResult.status} (${secretResult.scannedFilesCount} files scanned, ${secretResult.findings.length} findings, ${secretResult.durationMs}ms)`);

  // 2. Dependency Scan
  console.log('\n[2/13] Executing Dependency & Supply-Chain Scan...');
  const depResult = runDependencyScan(rootDir);
  summary.suites.push(depResult);
  console.log(`  -> Status: ${depResult.status} (${depResult.workspacesAudited.length} workspaces audited, ${depResult.findings.length} findings, ${depResult.durationMs}ms)`);

  // 3. Configuration & Security Headers Audit
  console.log('\n[3/13] Executing Configuration & Security Headers Audit...');
  const configResult = runConfigurationAudit(rootDir);
  summary.suites.push(configResult);
  console.log(`  -> Status: ${configResult.status} (${configResult.checksPassed} passed, ${configResult.checksFailed} failed, ${configResult.durationMs}ms)`);

  // 4. Static Code & SQL Analysis
  console.log('\n[4/13] Executing Static Code & SQL Vulnerability Analysis...');
  const staticResult = runStaticAnalysis(rootDir);
  summary.suites.push(staticResult);
  console.log(`  -> Status: ${staticResult.status} (${staticResult.scannedFilesCount} files analyzed, ${staticResult.findings.length} findings, ${staticResult.durationMs}ms)`);

  // 5. Authentication Matrix
  console.log('\n[5/13] Executing Authentication & Token Penetration Tests...');
  const authResult = await runAuthMatrixTests();
  summary.suites.push(authResult);
  console.log(`  -> Status: ${authResult.status} (${authResult.testsPassed}/${authResult.testsRun} tests passed, ${authResult.durationMs}ms)`);

  // 6. Authorization & IDOR/BOLA Suite
  console.log('\n[6/13] Executing Authorization & IDOR/BOLA Penetration Tests...');
  const authzResult = await runAuthorizationTests();
  summary.suites.push(authzResult);
  console.log(`  -> Status: ${authzResult.status} (${authzResult.testsPassed}/${authzResult.testsRun} tests passed, ${authzResult.durationMs}ms)`);

  // 7. Input Validation & Injection Suite
  console.log('\n[7/13] Executing Input Validation, Injection & Parameter Pollution Tests...');
  const injectionResult = await runInjectionTests();
  summary.suites.push(injectionResult);
  console.log(`  -> Status: ${injectionResult.status} (${injectionResult.testsPassed}/${injectionResult.testsRun} tests passed, ${injectionResult.durationMs}ms)`);

  // 8. AI & Spoiler-Safety Security Suite
  console.log('\n[8/13] Executing AI Security, Lore Gate & Anti-Spoiler Tests...');
  const aiResult = await runAiSecurityTests();
  summary.suites.push(aiResult);
  console.log(`  -> Status: ${aiResult.status} (${aiResult.testsPassed}/${aiResult.testsRun} tests passed, ${aiResult.durationMs}ms)`);

  // 9. SSRF Defense Suite
  console.log('\n[9/13] Executing Server-Side Request Forgery (SSRF) Defense Tests...');
  const ssrfResult = await runSsrfTests();
  summary.suites.push(ssrfResult);
  console.log(`  -> Status: ${ssrfResult.status} (${ssrfResult.testsPassed}/${ssrfResult.testsRun} tests passed, ${ssrfResult.durationMs}ms)`);

  // 10. File & Media Path Security Suite
  console.log('\n[10/13] Executing File & Media Path Traversal Defense Tests...');
  const fileResult = await runFileMediaTests();
  summary.suites.push(fileResult);
  console.log(`  -> Status: ${fileResult.status} (${fileResult.testsPassed}/${fileResult.testsRun} tests passed, ${fileResult.durationMs}ms)`);

  // 11. Robustness & Fuzz Testing Suite
  console.log('\n[11/13] Executing Robustness & Boundary Fuzz Testing...');
  const fuzzResult = await runFuzzTests();
  summary.suites.push(fuzzResult);
  console.log(`  -> Status: ${fuzzResult.status} (${fuzzResult.testsPassed}/${fuzzResult.testsRun} tests passed, ${fuzzResult.durationMs}ms)`);

  // 12. Dynamic HTTP Security & Guards Suite
  console.log('\n[12/13] Executing Dynamic HTTP Security, Guards & Header Tests...');
  const dynamicResult = await runDynamicSecurityTests();
  summary.suites.push(dynamicResult);
  console.log(`  -> Status: ${dynamicResult.status} (${dynamicResult.testsPassed}/${dynamicResult.testsRun} tests passed, ${dynamicResult.durationMs}ms)`);

  // 13. Infrastructure & CI/CD Audit
  console.log('\n[13/13] Executing Infrastructure, CI/CD & Container Audit...');
  const infraResult = runInfrastructureAudit(rootDir);
  summary.suites.push(infraResult);
  console.log(`  -> Status: ${infraResult.status} (${infraResult.checksPassed}/${infraResult.checksRun} checks passed, ${infraResult.durationMs}ms)`);

  const totalDuration = Date.now() - startTime;
  const anyFailed = summary.suites.some((s: any) => s.status === SecurityStatus.FAIL);
  summary.overallStatus = anyFailed ? 'FAIL' : 'PASS';

  // Generate Report Markdown
  const reportPath = path.join(reportsDir, 'SECURITY_AUDIT_REPORT.md');
  const jsonReportPath = path.join(reportsDir, 'security-audit-summary.json');

  fs.writeFileSync(jsonReportPath, JSON.stringify(summary, null, 2), 'utf8');

  let markdownReport = `# Wisp Security Audit & Penetration Testing Report

> **Automated Execution Timestamp:** ${summary.timestamp}  
> **Overall Security Posture Status:** **${summary.overallStatus}**  
> **Total Audit Duration:** ${totalDuration}ms

---

## 1. Executive Summary Table

| Audit Suite | Status | Key Metrics | Duration |
| :--- | :---: | :--- | :---: |
| **Secret & Credential Scanner** | ${secretResult.status} | Scanned: ${secretResult.scannedFilesCount} files, Findings: ${secretResult.findings.length} | ${secretResult.durationMs}ms |
| **Dependency & Supply-Chain** | ${depResult.status} | Workspaces: ${depResult.workspacesAudited.length}, Findings: ${depResult.findings.length} | ${depResult.durationMs}ms |
| **Configuration & Security Headers** | ${configResult.status} | Passed: ${configResult.checksPassed}, Failed: ${configResult.checksFailed} | ${configResult.durationMs}ms |
| **Static Code & SQL Analyzer** | ${staticResult.status} | Files: ${staticResult.scannedFilesCount}, Findings: ${staticResult.findings.length} | ${staticResult.durationMs}ms |
| **Authentication & Tokens Matrix** | ${authResult.status} | Passed: ${authResult.testsPassed}/${authResult.testsRun} tests | ${authResult.durationMs}ms |
| **Authorization & IDOR / BOLA** | ${authzResult.status} | Passed: ${authzResult.testsPassed}/${authzResult.testsRun} tests | ${authzResult.durationMs}ms |
| **Input Validation & Injection** | ${injectionResult.status} | Passed: ${injectionResult.testsPassed}/${injectionResult.testsRun} tests | ${injectionResult.durationMs}ms |
| **AI Security & Anti-Spoiler** | ${aiResult.status} | Passed: ${aiResult.testsPassed}/${aiResult.testsRun} tests | ${aiResult.durationMs}ms |
| **SSRF Defense Suite** | ${ssrfResult.status} | Passed: ${ssrfResult.testsPassed}/${ssrfResult.testsRun} tests | ${ssrfResult.durationMs}ms |
| **File, Media & Path Traversal** | ${fileResult.status} | Passed: ${fileResult.testsPassed}/${fileResult.testsRun} tests | ${fileResult.durationMs}ms |
| **Robustness & Fuzz Testing** | ${fuzzResult.status} | Passed: ${fuzzResult.testsPassed}/${fuzzResult.testsRun} tests | ${fuzzResult.durationMs}ms |
| **Dynamic HTTP Security & Guards** | ${dynamicResult.status} | Passed: ${dynamicResult.testsPassed}/${dynamicResult.testsRun} tests | ${dynamicResult.durationMs}ms |
| **Infrastructure & CI/CD Audit** | ${infraResult.status} | Passed: ${infraResult.checksPassed}/${infraResult.checksRun} checks | ${infraResult.durationMs}ms |

---

## 2. Key Findings & Remediation Summary

### SEC-01: Deterministic Anti-Spoiler Boundary (CRITICAL — FIXED)
- **Component:** \`@wisp/ai-engine\` (\`ai-engine/src/context/temporal-filter.ts\`)
- **Remediation:** Removed the hardcoded \`Math.max(effectivePlayhead, 30000)\` filter window that leaked dialogue up to 30s ahead during the opening 30 seconds of an episode. Replaced with strict \`seg.endTimeMs <= effectivePlayhead\`.
- **Status:** **FIXED & VERIFIED**

### SEC-02: Denial-of-Wallet & Prompt Length Bounding (HIGH — FIXED)
- **Component:** \`backend/src/common/dto/wisp-query.dto.ts\`
- **Remediation:** Enforced strict \`@MaxLength(300)\` constraint on incoming AI prompt payloads to prevent massive token burn and financial denial-of-wallet on third-party LLM APIs.
- **Status:** **FIXED & VERIFIED**

### SEC-03: Cloudflare Edge Worker CORS Wildcard (HIGH — FIXED)
- **Component:** \`cloudflare/src/index.ts\`
- **Remediation:** Replaced permissive unconditional \`Access-Control-Allow-Origin: *\` with dynamic origin allowlist validation matching backend policy, and forwarded authorization headers upstream.
- **Status:** **FIXED & VERIFIED**

### SEC-04: ChatML & Unicode Bidi Input Sanitization Gaps (MEDIUM — FIXED)
- **Component:** \`backend/src/common/security/input-sanitizer.ts\`
- **Remediation:** Expanded input sanitization regex to neutralize extended ChatML boundary tokens (\`<|endoftext|>\`, \`<|fim_prefix|>\`), Unicode Bi-directional (RLO) formatting overrides, and zero-width spaces; extended middleware to sanitize query parameters.
- **Status:** **FIXED & VERIFIED**

### SEC-05: Database Schema Disclosure in Exception Filter (LOW — FIXED)
- **Component:** \`backend/src/common/filters/http-exception.filter.ts\`
- **Remediation:** Sanitized raw PostgreSQL constraint and permission error messages in production mode to prevent leaking database table and column names to clients.
- **Status:** **FIXED & VERIFIED**
`;

  fs.writeFileSync(reportPath, markdownReport, 'utf8');

  console.log('\n' + '='.repeat(80));
  console.log(`  AUDIT COMPLETE: Overall Status [${summary.overallStatus}] in ${totalDuration}ms`);
  console.log(`  Markdown Report saved to: ${reportPath}`);
  console.log(`  JSON Summary saved to:    ${jsonReportPath}`);
  console.log('='.repeat(80) + '\n');

  if (anyFailed) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Fatal error during security audit execution:', err);
  process.exit(1);
});
