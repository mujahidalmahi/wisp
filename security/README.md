# Wisp Security Auditing & Penetration Testing Framework

> **Continuous Application Security, Threat Modeling, Penetration Testing & Regression Verification**  
> **Project:** Wisp — *AI-Powered Contextual Viewing for Amazon Fire TV*

---

## 1. Overview

This toolkit provides a reusable, automated security auditing and penetration testing program for the Wisp platform. It continuously tests the architecture against the **OWASP Top 10**, **OWASP API Security Top 10**, **OWASP Top 10 for LLM Applications**, and the deterministic temporal anti-spoiler boundaries of Wisp.

## 2. Directory Structure

```text
security/
├── README.md                           # Architecture and usage documentation
├── config/
│   └── security.config.ts              # Severity levels, CVSS mapping, and policy boundaries
├── scanners/
│   ├── secret-scanner.ts               # High-entropy pattern and credential scanner with redaction
│   ├── dependency-scanner.ts           # Supply-chain and unpinned dependency scanner
│   └── config-audit.ts                 # Security headers, env templates, and payload limits audit
├── static/
│   └── static-analyzer.ts              # AST/Regex static code and SQL search_path analyzer
├── auth/
│   └── auth-matrix-validator.ts        # JWT signature forgery, 'none' algorithm, expiration, revocation
├── authorization/
│   └── idor-bola-tester.ts             # Horizontal IDOR, sole profile retention, vertical escalation
├── injection/
│   └── injection-suite.ts              # SQLi, HPP, prototype pollution, control characters
├── ai/
│   └── ai-security-tester.ts           # Spoiler-safety gate, prompt bounding, D-pad chip contract
├── ssrf/
│   └── ssrf-tester.ts                  # Cloud metadata (169.254.169.254), loopback, RFC 1918 defense
├── files/
│   └── file-media-tester.ts            # Path traversal (../../), executable uploads, media extensions
├── fuzz/
│   └── payload-fuzzer.ts               # Malformed JSON, cursor corruption, boundary integers, Unicode
├── dynamic/
│   └── dynamic-tester.ts               # Live HTTP guards, CSRF HMAC tokens, rate-limit headers (429)
├── infrastructure/
│   └── infra-docker-tester.ts          # CI/CD workflows, Cloudflare wrangler, Docker security
├── reports/                            # Generated audit markdown and JSON summaries
├── runner.ts                           # Master audit runner (npm run security:audit)
└── regression.test.ts                  # Node.js automated regression suite (npm run security:test)
```

## 3. Commands

### Full Comprehensive Security Audit (All 13 Suites)
```bash
npm run security:audit
```
Executes all scanners, static analyzers, and penetration testing suites, outputting results and generating `security/reports/SECURITY_AUDIT_REPORT.md` and `security/reports/security-audit-summary.json`.

### Automated Security Regression Tests
```bash
npm run security:test
```
Runs permanent automated regression assertions for verified vulnerabilities SEC-01 through SEC-05 via the native Node.js test runner.

---

## 4. Threat Model Summary

- **Primary Assets:** Viewer profiles, multi-turn conversation sessions, AI API quotas/keys, temporal context graphs, and unreleased plot twist lore.
- **Key Threat Actors:**
  - Anonymous attackers attempting rate-limit evasion or credential harvesting.
  - Malicious authenticated devices attempting horizontal IDOR on neighboring viewer profiles.
  - Prompt injection adversaries attempting to bypass the anti-spoiler gate or induce denial-of-wallet token consumption.
- **Trust Boundaries:**
  1. *Internet <-> Cloudflare Worker Edge*
  2. *Cloudflare Worker <-> NestJS API Gateway*
  3. *NestJS API Gateway <-> Supabase PostgreSQL (RLS / Service-Role boundary)*
  4. *NestJS API Gateway <-> External AI Providers (Groq, Gemini, OpenRouter)*
  5. *NestJS API Gateway <-> Fire TV React Native UI*
  6. *Temporal Playhead Boundary (`playbackPositionMs`)*
