import assert from 'node:assert/strict';
import { SecurityStatus } from '../config/security.config.ts';

export interface FileMediaTestResult {
  suite: string;
  status: SecurityStatus;
  testsRun: number;
  testsPassed: number;
  testsFailed: number;
  results: Array<{ testName: string; passed: boolean; details?: string }>;
  durationMs: number;
}

export function sanitizeMediaObjectKey(rawKey: string): string | null {
  if (typeof rawKey !== 'string') return null;
  const decoded = decodeURIComponent(rawKey);

  // Path traversal check
  if (decoded.includes('..') || decoded.includes('\\') || decoded.startsWith('/')) {
    return null;
  }

  // Allowed media extensions
  const allowedExtensions = ['.mp4', '.m4v', '.webm', '.vtt', '.jpg', '.jpeg', '.png', '.webp'];
  const hasValidExt = allowedExtensions.some((ext) => decoded.toLowerCase().endsWith(ext));
  if (!hasValidExt) {
    return null;
  }

  // Sanitize key to alphanumeric, dashes, underscores, and forward slashes
  if (!/^[a-zA-Z0-9_\-\.\/]+$/.test(decoded)) {
    return null;
  }

  return decoded;
}

export async function runFileMediaTests(): Promise<FileMediaTestResult> {
  const start = Date.now();
  const results: FileMediaTestResult['results'] = [];
  let testsRun = 0;
  let testsPassed = 0;
  let testsFailed = 0;

  function record(testName: string, fn: () => void) {
    testsRun++;
    try {
      fn();
      testsPassed++;
      results.push({ testName, passed: true });
    } catch (err: any) {
      testsFailed++;
      results.push({ testName, passed: false, details: err?.message });
    }
  }

  // Test 1: Rejects Path Traversal in Object Key
  record('Rejects Dot-Dot-Slash Path Traversal in Media Keys (../../etc/passwd)', () => {
    assert.equal(sanitizeMediaObjectKey('../../etc/passwd.mp4'), null);
    assert.equal(sanitizeMediaObjectKey('..%2F..%2Fconfig.toml'), null);
    assert.equal(sanitizeMediaObjectKey('/etc/shadow.mp4'), null);
  });

  // Test 2: Rejects Executable and Dangerous File Extensions
  record('Rejects Executable & Script Extensions (.sh, .exe, .js, .svg, .php)', () => {
    assert.equal(sanitizeMediaObjectKey('payload.sh'), null);
    assert.equal(sanitizeMediaObjectKey('exploit.exe'), null);
    assert.equal(sanitizeMediaObjectKey('malicious.svg'), null);
    assert.equal(sanitizeMediaObjectKey('script.js'), null);
    assert.equal(sanitizeMediaObjectKey('shell.php.mp4.php'), null);
  });

  // Test 3: Accepts Safe Valid Media Assets
  record('Accepts Valid Video and Image Media Assets (.mp4, .vtt, .jpg, .webp)', () => {
    assert.equal(sanitizeMediaObjectKey('movies/tears-of-steel-1080p.mp4'), 'movies/tears-of-steel-1080p.mp4');
    assert.equal(sanitizeMediaObjectKey('subtitles/en-dialogue.vtt'), 'subtitles/en-dialogue.vtt');
    assert.equal(sanitizeMediaObjectKey('posters/sintel-backdrop.webp'), 'posters/sintel-backdrop.webp');
  });

  const durationMs = Date.now() - start;
  const status = testsFailed === 0 ? SecurityStatus.PASS : SecurityStatus.FAIL;

  return {
    suite: 'File, Media & Path Traversal Security Suite',
    status,
    testsRun,
    testsPassed,
    testsFailed,
    results,
    durationMs,
  };
}
