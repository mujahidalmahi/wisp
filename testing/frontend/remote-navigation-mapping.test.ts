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
      playerSurfaceSource.includes('{!overlayVisible && ('),
      'Player trigger bar must hide when overlay is open to prevent D-pad focus stealing',
    );
  });
});
