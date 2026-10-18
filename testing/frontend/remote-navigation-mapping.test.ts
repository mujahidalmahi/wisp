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

  it('maps desktop and emulator keyboard shortcuts (M, C, V, ?, Space, ArrowLeft, ArrowRight, Escape)', () => {
    assert.ok(remoteHookSource.includes("case 'm':"));
    assert.ok(remoteHookSource.includes("case 'c':"));
    assert.ok(remoteHookSource.includes("case 'v':"));
    assert.ok(remoteHookSource.includes("case '?':"));
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

  it('supports closed captioning (CC) subtitle rendering and timeline scene chapter pins in VideoPlayerSurface', () => {
    assert.ok(
      playerSurfaceSource.includes('subtitlesEnabled'),
      'VideoPlayerSurface must manage subtitlesEnabled state',
    );
    assert.ok(
      playerSurfaceSource.includes('subtitleBanner'),
      'VideoPlayerSurface must provide subtitleBanner for AD/CC accessibility',
    );
    assert.ok(
      playerSurfaceSource.includes('chapterPin'),
      'VideoPlayerSurface must render chapter marker pins on scrubber bar',
    );
    assert.ok(
      playerSurfaceSource.includes('sceneMarkers'),
      'VideoPlayerSurface must accept sceneMarkers prop',
    );
  });

  it('provides AlexaVoiceModal with curated zero-typing voice prompts and cyan glow styling', () => {
    const alexaSource = fs.readFileSync(
      path.resolve('frontend/src/components/modals/AlexaVoiceModal.tsx'),
      'utf8',
    );
    assert.ok(
      alexaSource.includes('CURATED_VOICE_QUERIES'),
      'AlexaVoiceModal must define CURATED_VOICE_QUERIES',
    );
    assert.ok(
      alexaSource.includes('alexaGlowBar'),
      'AlexaVoiceModal must feature signature cyan glow bar',
    );
    assert.ok(
      alexaSource.includes('onSelectQuery'),
      'AlexaVoiceModal must invoke onSelectQuery when user triggers query',
    );
  });

  it('provides RemoteControlGuideModal mapping Fire TV hardware keys to keyboard equivalents', () => {
    const guideSource = fs.readFileSync(
      path.resolve('frontend/src/components/modals/RemoteControlGuideModal.tsx'),
      'utf8',
    );
    assert.ok(
      guideSource.includes('REMOTE_GUIDE_ITEMS'),
      'RemoteControlGuideModal must define REMOTE_GUIDE_ITEMS',
    );
    assert.ok(
      guideSource.includes('remoteBadge'),
      'RemoteControlGuideModal must display styled remote key badges',
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

  it('supports playback speed scaling (S shortcut), stream specs telemetry, and audio description cues', () => {
    assert.ok(
      remoteHookSource.includes("case 's':"),
      'Remote hook must map keyboard shortcut s for playback speed',
    );
    assert.ok(
      playerSurfaceSource.includes('playbackSpeed'),
      'VideoPlayerSurface must accept playbackSpeed prop',
    );
    assert.ok(
      playerSurfaceSource.includes('onCyclePlaybackSpeed'),
      'VideoPlayerSurface must expose onCyclePlaybackSpeed prop',
    );
    assert.ok(
      playerSurfaceSource.includes('streamSpecsRow'),
      'VideoPlayerSurface must render technical stream telemetry specs',
    );
    assert.ok(
      playerSurfaceSource.includes('subtitleAudioCueBadge'),
      'VideoPlayerSurface must render audio description / sound effect cues',
    );
  });

  it('provides gamified household trivia streak and point scoring in InteractiveQuizCard', () => {
    const quizSource = fs.readFileSync(
      path.resolve('frontend/src/components/overlay/InteractiveQuizCard.tsx'),
      'utf8',
    );
    assert.ok(
      quizSource.includes('totalPoints'),
      'InteractiveQuizCard must track totalPoints',
    );
    assert.ok(
      quizSource.includes('streak'),
      'InteractiveQuizCard must track correct answer streak',
    );
    assert.ok(
      quizSource.includes('streakBadge'),
      'InteractiveQuizCard must render streakBadge for living room gamification',
    );
  });

  it('provides D-pad entity category filter tabs in ActiveEntitiesBar', () => {
    const entitiesSource = fs.readFileSync(
      path.resolve('frontend/src/components/overlay/ActiveEntitiesBar.tsx'),
      'utf8',
    );
    assert.ok(
      entitiesSource.includes('activeFilter'),
      'ActiveEntitiesBar must track activeFilter state',
    );
    assert.ok(
      entitiesSource.includes('filterTab'),
      'ActiveEntitiesBar must render filterTab buttons',
    );
  });
});
