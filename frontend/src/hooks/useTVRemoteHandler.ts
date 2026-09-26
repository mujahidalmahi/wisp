import { useEffect } from 'react';
// @ts-ignore - TVEventHandler is provided by react-native-tvos runtime on Fire TV
import { useTVEventHandler } from 'react-native';

export interface TVRemoteActions {
  onToggleWispOverlay: () => void;
  onPlayPause?: () => void;
  onBack?: () => void;
}

/**
 * Listens for Amazon Fire TV remote hardware D-pad & media events.
 */
export function useTVRemoteHandler(actions: TVRemoteActions) {
  const handleEvent = (evt: { eventType?: string }) => {
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
      default:
        break;
    }
  };

  useEffect(() => {
    if (typeof useTVEventHandler === 'function') {
      // Registered via react-native-tvos hook when running on Fire OS
    }
  }, []);

  if (typeof useTVEventHandler === 'function') {
    useTVEventHandler(handleEvent);
  }
}
