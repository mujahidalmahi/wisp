import { useWindowDimensions } from 'react-native';
import { TVTheme } from '../theme/tvTheme';

export interface TVResponsiveLayout {
  width: number;
  height: number;
  is4K: boolean;
  is1080p: boolean;
  is720p: boolean;
  scaleFactor: number;
  overscanHorizontal: number;
  overscanVertical: number;
  drawerWidth: number;
  catalogMaxWidth: number;
}

export function useTVResponsive(): TVResponsiveLayout {
  const { width = 1920, height = 1080 } = useWindowDimensions() || {};

  const is4K = width >= 3840 || height >= 2160;
  const is1080p = width >= 1920 && !is4K;
  const is720p = width < 1920;

  // Base 1080p scale reference
  const scaleFactor = Math.min(1.5, Math.max(0.75, width / 1920));

  // 5% Overscan Safe Margins: enforce minimums of 48px horizontal and 28px vertical
  const overscanHorizontal = Math.max(
    TVTheme.spacing.overscanHorizontal,
    Math.round(width * 0.05),
  );
  const overscanVertical = Math.max(
    TVTheme.spacing.overscanVertical,
    Math.round(height * 0.05),
  );

  // Drawer width: between 480px and 720px depending on screen width
  const drawerWidth = Math.min(720, Math.max(480, Math.round(width * 0.32)));

  // Catalog modal max width
  const catalogMaxWidth = Math.min(1360, Math.max(900, Math.round(width * 0.72)));

  return {
    width,
    height,
    is4K,
    is1080p,
    is720p,
    scaleFactor,
    overscanHorizontal,
    overscanVertical,
    drawerWidth,
    catalogMaxWidth,
  };
}
