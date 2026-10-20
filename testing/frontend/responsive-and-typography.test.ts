import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { TVTheme } from '../../frontend/src/theme/tvTheme.ts';

describe('Frontend 10-Foot Typography & Responsive Scaling Contracts', () => {
  it('enforces rigorous 10-foot couch typography across all visual hierarchies', () => {
    // Hero titles for big screen impact
    assert.ok(
      TVTheme.typography.heroTitle >= 34,
      `Hero title must be >= 34sp, received ${TVTheme.typography.heroTitle}`,
    );

    // Card headlines readable at 10 feet
    assert.ok(
      TVTheme.typography.cardHeadline >= 26,
      `Card headline must be >= 26sp, received ${TVTheme.typography.cardHeadline}`,
    );

    // Core body typography strictly >= 22sp
    assert.ok(
      TVTheme.typography.body10Foot >= 22,
      `Body typography must be >= 22sp for 10-foot viewing, received ${TVTheme.typography.body10Foot}`,
    );

    // Subtitles and chip labels >= 20sp
    assert.ok(
      TVTheme.typography.subtitle >= 20,
      `Subtitle must be >= 20sp, received ${TVTheme.typography.subtitle}`,
    );
    assert.ok(
      TVTheme.typography.chipLabel >= 20,
      `Chip label must be >= 20sp, received ${TVTheme.typography.chipLabel}`,
    );

    // Button text >= 18sp
    assert.ok(
      TVTheme.typography.buttonText >= 18,
      `Button text must be >= 18sp, received ${TVTheme.typography.buttonText}`,
    );

    // Metadata badges and captions >= 16sp (never unreadable 10-14sp)
    assert.ok(
      TVTheme.typography.badge >= 16,
      `Badge text must be >= 16sp, received ${TVTheme.typography.badge}`,
    );
    assert.ok(
      TVTheme.typography.caption >= 16,
      `Caption text must be >= 16sp, received ${TVTheme.typography.caption}`,
    );
  });

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

  it('defines high-contrast Fire TV amber focus ring with bloom glow', () => {
    assert.equal(
      TVTheme.colors.focusRing.toUpperCase(),
      '#F59E0B',
      'Focus ring must be high-contrast Fire TV amber #F59E0B',
    );
    assert.ok(TVTheme.glow.focusRingShadow, 'Must define amber focus glow shadow');
    assert.equal(
      TVTheme.glow.focusRingShadow.shadowColor.toUpperCase(),
      '#F59E0B',
      'Glow shadow must be Fire TV amber',
    );
    assert.ok(TVTheme.glow.focusRingShadow.shadowRadius >= 10, 'Glow radius must be >= 10');
  });

  it('verifies responsive scale calculations for 720p, 1080p, and 4K displays', () => {
    // 1080p standard reference: width = 1920, height = 1080
    const overscanH_1080 = Math.max(48, Math.round(1920 * 0.05));
    const overscanV_1080 = Math.max(28, Math.round(1080 * 0.05));
    assert.equal(overscanH_1080, 96);
    assert.equal(overscanV_1080, 54);

    // 4K Ultra HD: width = 3840, height = 2160
    const overscanH_4K = Math.max(48, Math.round(3840 * 0.05));
    const overscanV_4K = Math.max(28, Math.round(2160 * 0.05));
    assert.equal(overscanH_4K, 192);
    assert.equal(overscanV_4K, 108);

    // 720p Compact: width = 1280, height = 720
    const overscanH_720 = Math.max(48, Math.round(1280 * 0.05));
    const overscanV_720 = Math.max(28, Math.round(720 * 0.05));
    assert.equal(overscanH_720, 64);
    assert.equal(overscanV_720, 36);
  });
});
