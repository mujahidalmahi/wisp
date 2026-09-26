import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { TVTheme } from '../../frontend/src/theme/tvTheme.ts';

describe('Frontend: Fire TV 10-Foot UI Ergonomics, Typography & Overscan Rules', () => {
  it('enforces 5% TV overscan safe zone margins (>= 48px horizontal, >= 27px vertical)', () => {
    assert.ok(
      TVTheme.spacing.overscanHorizontal >= 48,
      'Horizontal overscan must be at least 48px on 1080p Fire TV',
    );
    assert.ok(
      TVTheme.spacing.overscanVertical >= 27,
      'Vertical overscan must be at least 27px on 1080p Fire TV',
    );
  });

  it('enforces distance-readable 10-foot typography scales (>= 22sp body, >= 26sp headline)', () => {
    assert.ok(
      TVTheme.typography.body10Foot >= 22,
      '10-foot body text must be at least 22sp for couch readability',
    );
    assert.ok(
      TVTheme.typography.cardHeadline >= 26,
      'Card headline must be at least 26sp',
    );
    assert.ok(TVTheme.typography.heroTitle >= 32, 'Hero title must be at least 32sp');
  });

  it('provides high-contrast dark surface and focus ring tokens for D-pad visibility', () => {
    assert.equal(TVTheme.colors.focusRing, '#F59E0B');
    assert.equal(TVTheme.colors.background, '#090B10');
  });
});
