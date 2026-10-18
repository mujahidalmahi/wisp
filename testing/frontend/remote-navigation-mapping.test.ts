import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

describe('Frontend: Fire TV Remote D-Pad & Focus Navigation Verification', () => {
  const remoteHookSource = fs.readFileSync(
    path.resolve('frontend/src/hooks/useTVRemoteHandler.ts'),
    'utf8',
  );
  const chipsComponentSource = fs.readFileSync(
    path.resolve('frontend/src/components/overlay/QuickActionChips.tsx'),
    'utf8',
  );
  const playerSurfaceSource = fs.readFileSync(
    path.resolve('frontend/src/components/player/VideoPlayerSurface.tsx'),
    'utf8',
  );

  it('maps Fire TV hardware remote events (menu, longSelect, playPause, back, left, right, rewind, fastForward)', () => {
    assert.ok(remoteHookSource.includes("case 'menu':"));
    assert.ok(remoteHookSource.includes("case 'longSelect':"));
    assert.ok(remoteHookSource.includes("case 'playPause':"));
    assert.ok(remoteHookSource.includes("case 'back':"));
    assert.ok(remoteHookSource.includes("case 'left':"));
    assert.ok(remoteHookSource.includes("case 'right':"));
    assert.ok(remoteHookSource.includes("case 'rewind':"));
    assert.ok(remoteHookSource.includes("case 'fastForward':"));
  });

  it('maps desktop and emulator keyboard shortcuts (M, C, Space, ArrowLeft, ArrowRight, Escape)', () => {
    assert.ok(remoteHookSource.includes("case 'm':"));
    assert.ok(remoteHookSource.includes("case 'c':"));
    assert.ok(remoteHookSource.includes("case ' ':"));
    assert.ok(remoteHookSource.includes("case 'ArrowLeft':"));
    assert.ok(remoteHookSource.includes("case 'ArrowRight':"));
    assert.ok(remoteHookSource.includes("case 'Escape':"));
  });

  it('sets hasTVPreferredFocus on the first QuickActionChip and hides background bar when overlay is open (FL-002 fix)', () => {
    assert.ok(
      chipsComponentSource.includes('hasTVPreferredFocus={idx === 0}'),
      'First QuickActionChip must claim initial D-pad focus when overlay mounts',
    );
    assert.ok(
      chipsComponentSource.includes('onBlur={() => setFocusedId(null)}'),
      'QuickActionChips must clear focused state onBlur to prevent stuck focus rings',
    );
    assert.ok(
      chipsComponentSource.includes('setFocusedId(chips[0]?.id ?? null)'),
      'QuickActionChips must reset focusedId when chips prop updates',
    );
    assert.ok(
      playerSurfaceSource.includes('{!overlayVisible && ('),
      'Player trigger bar must hide when overlay is open to prevent D-pad focus stealing',
    );
  });

  it('exposes Play/Pause controls and live playback indicators in VideoPlayerSurface', () => {
    assert.ok(
      playerSurfaceSource.includes('onTogglePlayPause'),
      'VideoPlayerSurface must expose onTogglePlayPause prop',
    );
    assert.ok(
      playerSurfaceSource.includes('styles.pausedBadge'),
      'VideoPlayerSurface must provide paused indicator badge',
    );
  });

  it('provides active inquiry display, back-to-scene action, cache badges, and retry button in WispOverlayDrawer', () => {
    const drawerSource = fs.readFileSync(
      path.resolve('frontend/src/components/overlay/WispOverlayDrawer.tsx'),
      'utf8',
    );
    assert.ok(
      drawerSource.includes('lastInquiryPrompt'),
      'WispOverlayDrawer must support rendering lastInquiryPrompt',
    );
    assert.ok(
      drawerSource.includes('onBackToScene'),
      'WispOverlayDrawer must provide onBackToScene navigation',
    );
    assert.ok(
      drawerSource.includes('onRetry'),
      'WispOverlayDrawer must provide onRetry error recovery action',
    );
    assert.ok(
      drawerSource.includes('INSTANT CACHE'),
      'WispOverlayDrawer must display instant cache telemetry badge',
    );
  });
});
