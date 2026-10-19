import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

describe('Frontend Aesthetic & Palette Guard: Zero Navy Blue & Zero AI Slop', () => {
  const srcDir = path.resolve('frontend/src');

  const getAllFiles = (dir: string, fileList: string[] = []): string[] => {
    const files = fs.readdirSync(dir);
    for (const file of files) {
      const fullPath = path.join(dir, file);
      if (fs.statSync(fullPath).isDirectory()) {
        getAllFiles(fullPath, fileList);
      } else if (file.endsWith('.tsx') || file.endsWith('.ts')) {
        fileList.push(fullPath);
      }
    }
    return fileList;
  };

  const sourceFiles = getAllFiles(srcDir);

  it('guarantees zero navy blue, slate blue, or saturated dark blue hex colors across all frontend components', () => {
    const forbiddenHexPatterns = [
      /#0F172A/i, // Tailwind slate-900 / dark navy
      /#1E293B/i, // Tailwind slate-800 / navy
      /#1E3A8A/i, // Tailwind blue-900
      /#1E40AF/i, // Tailwind blue-800
      /#1D4ED8/i, // Tailwind blue-700
      /#334155/i, // Tailwind slate-700
      /#38BDF8/i, // Tailwind sky-400 cyan
      /#090B10/i, // Muddy navy black
      /#151C28/i, // Faux dark navy
      /#0B132B/i, // Midnight navy
      /#1C2541/i, // Deep navy
    ];

    const violations: { file: string; match: string }[] = [];

    for (const file of sourceFiles) {
      const content = fs.readFileSync(file, 'utf8');
      for (const pattern of forbiddenHexPatterns) {
        if (pattern.test(content)) {
          violations.push({ file: path.relative(process.cwd(), file), match: pattern.source });
        }
      }
    }

    assert.equal(
      violations.length,
      0,
      `Found forbidden navy/blue colors in frontend source:\n${JSON.stringify(violations, null, 2)}`,
    );
  });

  it('guarantees zero navy/blue rgba strings in component styles', () => {
    const forbiddenRgbaPatterns = [
      /rgba\(\s*30,\s*58,\s*138/i, // Blue 900
      /rgba\(\s*15,\s*23,\s*42/i,  // Slate 900
      /rgba\(\s*30,\s*41,\s*59/i,  // Slate 800
      /rgba\(\s*56,\s*189,\s*248/i, // Sky 400
      /rgba\(\s*9,\s*11,\s*16/i,   // Muddy navy
    ];

    const violations: { file: string; match: string }[] = [];

    for (const file of sourceFiles) {
      const content = fs.readFileSync(file, 'utf8');
      for (const pattern of forbiddenRgbaPatterns) {
        if (pattern.test(content)) {
          violations.push({ file: path.relative(process.cwd(), file), match: pattern.source });
        }
      }
    }

    assert.equal(
      violations.length,
      0,
      `Found forbidden navy/blue rgba strings in frontend source:\n${JSON.stringify(violations, null, 2)}`,
    );
  });

  it('guarantees zero AI slop jargon or tacky watermarks in user-facing UI copy', () => {
    const forbiddenSlopTerms = [
      'Zero Temporal Leakage',
      'HEVC Main 10',
      'Artificial Intelligence Model v',
      'Neural Transformer Engine',
      'Powered by Advanced Deep Learning',
    ];

    const violations: { file: string; term: string }[] = [];

    for (const file of sourceFiles) {
      const content = fs.readFileSync(file, 'utf8');
      for (const term of forbiddenSlopTerms) {
        if (content.includes(term)) {
          violations.push({ file: path.relative(process.cwd(), file), term });
        }
      }
    }

    assert.equal(
      violations.length,
      0,
      `Found tacky AI slop terminology in frontend source:\n${JSON.stringify(violations, null, 2)}`,
    );
  });

  it('enforces clean cinema palette in TVTheme (obsidian, charcoal, titanium neutrals, amber focus)', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const themeSource = fs.readFileSync(path.resolve('frontend/src/theme/tvTheme.ts'), 'utf8');

    assert.ok(themeSource.includes("background: '#0A0A0C'"), 'Must use obsidian onyx background');
    assert.ok(themeSource.includes("cardSurface: '#141417'"), 'Must use warm matte charcoal card surface');
    assert.ok(themeSource.includes("cardFocused: '#202025'"), 'Must use titanium charcoal focused card');
    assert.ok(themeSource.includes("cardBorder: '#27272D'"), 'Must use hairline charcoal border');
    assert.ok(themeSource.includes("focusRing: '#F59E0B'"), 'Must use Fire TV amber focus ring');
  });
});
