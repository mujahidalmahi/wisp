import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { TVTheme } from '../../frontend/src/theme/tvTheme.ts';
import { DEMO_PROGRAMS } from '../../frontend/src/config/catalog.ts';

describe('Fire TV 10-Foot UI: Design Tokens & Safe Zone Contracts', () => {
  it('enforces 5% TV overscan safe margins (>= 48px horizontal, >= 28px vertical)', () => {
    assert.ok(
      TVTheme.spacing.overscanHorizontal >= 48,
      `Horizontal overscan margin must be >= 48px, received ${TVTheme.spacing.overscanHorizontal}`,
    );
    assert.ok(
      TVTheme.spacing.overscanVertical >= 28,
      `Vertical overscan margin must be >= 28px, received ${TVTheme.spacing.overscanVertical}`,
    );
  });

  it('enforces 10-foot couch distance typography (body >= 22sp, card headline >= 26sp)', () => {
    assert.ok(
      TVTheme.typography.body10Foot >= 22,
      `Body typography must be >= 22sp for 10-foot viewing, received ${TVTheme.typography.body10Foot}`,
    );
    assert.ok(
      TVTheme.typography.cardHeadline >= 26,
      `Card headline must be >= 26sp, received ${TVTheme.typography.cardHeadline}`,
    );
    assert.ok(
      TVTheme.typography.heroTitle >= 34,
      `Hero title must be >= 34sp, received ${TVTheme.typography.heroTitle}`,
    );
  });

  it('defines high-contrast Fire TV amber focus ring (#F59E0B)', () => {
    assert.equal(
      TVTheme.colors.focusRing.toUpperCase(),
      '#F59E0B',
      'Focus ring must be high-contrast Fire TV amber #F59E0B',
    );
  });
});

describe('Fire TV Client: 3-Genre Demo Catalog Invariants', () => {
  it('seeds all 3 hackathon genres (Sci-Fi, Mystery / Thriller, Science Documentary)', () => {
    const genres = DEMO_PROGRAMS.map((p) => p.genre);
    assert.ok(genres.includes('Sci-Fi'), 'Must contain Sci-Fi genre');
    assert.ok(genres.includes('Mystery / Thriller'), 'Must contain Mystery / Thriller genre');
    assert.ok(genres.includes('Science Documentary'), 'Must contain Science Documentary genre');
  });

  it('validates every catalog program has valid identifiers, non-zero duration, and public-domain stream URL', () => {
    for (const prog of DEMO_PROGRAMS) {
      assert.ok(prog.programId.length > 0, `Program ${prog.title} missing programId`);
      assert.ok(prog.episodeId.length > 0, `Program ${prog.title} missing episodeId`);
      assert.ok(prog.durationSeconds > 60, `Program ${prog.title} duration must be > 60s`);
      assert.ok(prog.synopsis.length > 10, `Program ${prog.title} must have descriptive synopsis`);
      assert.ok(
        prog.videoStreamUrl && prog.videoStreamUrl.startsWith('https://') && prog.videoStreamUrl.endsWith('.mp4'),
        `Program ${prog.title} must have valid HTTPS MP4 stream URL`,
      );
    }
  });

  it('strictly matches catalog episode IDs with database seed schema (Issue 1)', () => {
    const tears = DEMO_PROGRAMS.find((p) => p.title === 'Tears of Steel');
    const cosmos = DEMO_PROGRAMS.find((p) => p.title.includes('Cosmic Origins'));
    const midnight = DEMO_PROGRAMS.find((p) => p.title.includes('The Midnight Cipher'));

    assert.equal(tears?.episodeId, 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1');
    assert.equal(cosmos?.episodeId, 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb2');
    assert.equal(midnight?.episodeId, 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb3');
  });
});
