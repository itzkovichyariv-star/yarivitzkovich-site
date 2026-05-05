// Color & animation parameters for the three pin classes on /live.
// Maps the design spec §4.1–4.2 to runtime values consumed by LiveGlobe.tsx.

export type VisitorClass = 'first_time' | 'returning' | 'downloader';

export interface PinStyle {
  /** Hex color for the dot + ring */
  color: string;
  /** Pixel radius of the steady-state dot at default zoom */
  dotRadius: number;
  /** Max ring radius in arc-degrees */
  ringRadius: number;
  /** Ring expansion duration (ms) */
  ringDurationMs: number;
  /** How many concentric rings to draw on entrance */
  ringCount: 1 | 2;
  /** Final opacity of the dot once it has joined the history layer */
  fadeOpacity: number;
  /** CSS-equivalent bloom blur in px (used for stronger glow on downloader) */
  bloomPx: number;
}

export const PIN_STYLES: Record<VisitorClass, PinStyle> = {
  first_time: {
    color: '#D98B9A',
    dotRadius: 3,
    ringRadius: 1.8,
    ringDurationMs: 900,
    ringCount: 1,
    fadeOpacity: 0.08,
    bloomPx: 0,
  },
  returning: {
    color: '#A85368',
    dotRadius: 4,
    ringRadius: 2.4,
    ringDurationMs: 1100,
    ringCount: 1,
    fadeOpacity: 0.14,
    bloomPx: 2,
  },
  downloader: {
    color: '#7A1E2B',
    dotRadius: 6,
    ringRadius: 3.0,
    ringDurationMs: 1200,
    ringCount: 2,
    fadeOpacity: 0.22,
    bloomPx: 6,
  },
};

/** Hex → rgba string with alpha applied */
export function withAlpha(hex: string, alpha: number): string {
  const m = hex.replace('#', '');
  const r = parseInt(m.slice(0, 2), 16);
  const g = parseInt(m.slice(2, 4), 16);
  const b = parseInt(m.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/** Pin classes ordered by hierarchy (cool → warm → hot). */
export const VISITOR_CLASSES: VisitorClass[] = ['first_time', 'returning', 'downloader'];
