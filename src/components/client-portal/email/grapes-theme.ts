import type { CustomThemeConfig } from '@grapesjs/studio-sdk';

/**
 * Darken a hex color by a percentage.
 */
function darkenHex(hex: string, percent: number): string {
  const num = parseInt(hex.replace('#', ''), 16);
  const r = Math.max(0, Math.min(255, ((num >> 16) & 0xff) - Math.round(255 * (percent / 100))));
  const g = Math.max(0, Math.min(255, ((num >> 8) & 0xff) - Math.round(255 * (percent / 100))));
  const b = Math.max(0, Math.min(255, (num & 0xff) - Math.round(255 * (percent / 100))));
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

export function getSteveTheme(brandColor?: string): CustomThemeConfig {
  const primary = brandColor || '#6C47FF';
  return {
    default: {
      colors: {
        primary: {
          background1: primary,
          backgroundHover: darkenHex(primary, 10),
          text: '#ffffff',
        },
      },
    },
  };
}
