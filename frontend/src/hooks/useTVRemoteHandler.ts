import { useEffect } from 'react';
// @ts-ignore - TVEventHandler is provided by react-native-tvos runtime on Fire TV
import { useTVEventHandler } from 'react-native';

export interface TVRemoteActions {
  onToggleWispOverlay: () => void;
  onPlayPause?: () => void;
  onBack?: () => void;
  onToggleCatalog?: () => void;
  onSeek?: (deltaMs: number) => void;
}

/**
 * Listens for Amazon Fire TV remote hardware D-pad & media events,
 * as well as desktop/emulator keyboard equivalents:
 * - M: Toggle Wisp overlay
 * - C: Toggle Catalog selector
 * - Space: Play / Pause
 * - Left/Right: Seek -10s / +10s
 * - Esc: Back / Dismiss
 */
export function useTVRemoteHandler(actions: TVRemoteActions) {
  const handleTVEvent = (evt: { eventType?: string }) => {
    if (!evt || !evt.eventType) return;

    switch (evt.eventType) {
      case 'menu':
      case 'longSelect':
        actions.onToggleWispOverlay();
        break;
      case 'playPause':
        actions.onPlayPause?.();
        break;
      case 'back':
        actions.onBack?.();
        break;
      case 'left':
      case 'rewind':
        actions.onSeek?.(-10000);
        break;
      case 'right':
      case 'fastForward':
        actions.onSeek?.(10000);
        break;
      default:
        break;
    }
  };

  useEffect(() => {
    if (typeof window === 'undefined' || !window.addEventListener) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) {
        return;
      }

      switch (e.key) {
        case 'm':
        case 'M':
          e.preventDefault();
          actions.onToggleWispOverlay();
          break;
        case 'c':
        case 'C':
          e.preventDefault();
          actions.onToggleCatalog?.();
          break;
        case ' ':
          e.preventDefault();
          actions.onPlayPause?.();
          break;
        case 'ArrowLeft':
          e.preventDefault();
          actions.onSeek?.(-10000);
          break;
        case 'ArrowRight':
          e.preventDefault();
          actions.onSeek?.(10000);
          break;
        case 'Escape':
          e.preventDefault();
          actions.onBack?.();
          break;
        default:
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [actions]);

  if (typeof useTVEventHandler === 'function') {
    useTVEventHandler(handleTVEvent);
  }
}

