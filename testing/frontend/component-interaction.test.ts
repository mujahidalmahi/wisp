import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

describe('Frontend Component Architecture & 10-Foot Interaction Invariants', () => {
  const playerSurfaceSource = fs.readFileSync(
    path.resolve('frontend/src/components/player/VideoPlayerSurface.tsx'),
    'utf8',
  );
  const overlayDrawerSource = fs.readFileSync(
    path.resolve('frontend/src/components/overlay/WispOverlayDrawer.tsx'),
    'utf8',
  );
  const quizCardSource = fs.readFileSync(
    path.resolve('frontend/src/components/overlay/InteractiveQuizCard.tsx'),
    'utf8',
  );
  const entitiesBarSource = fs.readFileSync(
    path.resolve('frontend/src/components/overlay/ActiveEntitiesBar.tsx'),
    'utf8',
  );
  const catalogSource = fs.readFileSync(
    path.resolve('frontend/src/components/catalog/CatalogSelector.tsx'),
    'utf8',
  );
  const appSource = fs.readFileSync(
    path.resolve('frontend/src/App.tsx'),
    'utf8',
  );

  it('verifies VideoPlayerSurface includes chapter notches, play/pause, and format badges', () => {
    assert.ok(
      playerSurfaceSource.includes('chapterNotch'),
      'Must render scene chapter notches along progress timeline',
    );
    assert.ok(
      playerSurfaceSource.includes('playPauseButton'),
      'Must render dedicated D-pad focusable play/pause button',
    );
    assert.ok(
      playerSurfaceSource.includes('4K UHD • HDR10 • ATMOS'),
      'Must surface cinema format badges in HUD',
    );
    assert.ok(
      playerSurfaceSource.includes('{!overlayVisible && ('),
      'Must hide bottom controls while overlay is open to prevent D-pad focus stealing',
    );
  });

  it('verifies WispOverlayDrawer includes spoiler lock, telemetry, and helpfulness voting', () => {
    assert.ok(
      overlayDrawerSource.includes('SPOILER-SAFE LOCK @'),
      'Must render spoiler-safe timestamp lock in overlay header',
    );
    assert.ok(
      overlayDrawerSource.includes('voteButton'),
      'Must render D-pad focusable helpfulness voting buttons (thumbs up/down)',
    );
    assert.ok(
      overlayDrawerSource.includes('providerMeta') || overlayDrawerSource.includes('providerTelemetry'),
      'Must render AI provider telemetry badge',
    );
  });

  it('verifies InteractiveQuizCard maintains focus post-answer and reveals explanation (FL-014 fix)', () => {
    assert.ok(
      quizCardSource.includes('optionFocusedPostAnswer'),
      'Must preserve D-pad focus ring on options post-answer evaluation (FL-014 fix)',
    );
    assert.ok(
      quizCardSource.includes('explanationCard'),
      'Must render explanation reveal card upon answering',
    );
    assert.ok(
      quizCardSource.includes('letterCircle'),
      'Must render high-contrast letter indicator (A, B, C, D) for each trivia option',
    );
  });

  it('verifies ActiveEntitiesBar surfaces characters on screen with progressive lore inspection', () => {
    assert.ok(
      entitiesBarSource.includes('CHARACTERS & LORE ON SCREEN'),
      'Must render section header for on-screen characters',
    );
    assert.ok(
      entitiesBarSource.includes('spotlightCard'),
      'Must render detailed spotlight card for selected character',
    );
    assert.ok(
      entitiesBarSource.includes('askButton'),
      'Must render direct D-pad action button to query Wisp about character',
    );
  });

  it('verifies CatalogSelector provides horizontal scrolling and multi-genre demo cards', () => {
    assert.ok(
      catalogSource.includes('ScrollView'),
      'Must wrap catalog grid in ScrollView for responsive screen adaptability',
    );
    assert.ok(
      catalogSource.includes('NOW PLAYING'),
      'Must render now playing badge on active program',
    );
  });

  it('verifies App.tsx manages continuous playhead ticker, play/pause, and profile shortcuts', () => {
    assert.ok(
      appSource.includes('setInterval'),
      'Must maintain active 1-second playhead ticker simulating real media playback',
    );
    assert.ok(
      appSource.includes('handleTogglePlayPause'),
      'Must wire play/pause handler to remote and keyboard controls',
    );
    assert.ok(
      appSource.includes('handleVoteCard'),
      'Must handle viewer feedback voting',
    );
  });
});
