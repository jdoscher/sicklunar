// Pure helpers for the Orbit lab UI (no DOM, no three.js), so node tests can cover them.

export type RGB = [number, number, number];

/** Coverage heat ramp: luminance-monotonic single hue, transparent -> #1E4E6E -> #2E8FB0 -> #7AD4FF -> #F3F5F8.
 *  Reads in greyscale and for colour-blind viewers (design system, Orbit lab coverage). */
export const HEAT_STOPS: [number, string][] = [[0, "#1E4E6E"], [1 / 3, "#2E8FB0"], [2 / 3, "#7AD4FF"], [1, "#F3F5F8"]];

export function hexToRgb(hex: string): RGB {
  const n = parseInt(hex.replace("#", ""), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

const STOPS_RGB: [number, RGB][] = HEAT_STOPS.map(([t, h]) => [t, hexToRgb(h)]);

/** Colour (0..1 RGB) for a coverage fraction v in [0, 1]. */
export function heatColor(v: number): RGB {
  const x = Math.min(1, Math.max(0, Number.isFinite(v) ? v : 0));
  for (let i = 1; i < STOPS_RGB.length; i++) {
    const [t1, c1] = STOPS_RGB[i];
    if (x <= t1) {
      const [t0, c0] = STOPS_RGB[i - 1];
      const f = (x - t0) / (t1 - t0);
      return [c0[0] + (c1[0] - c0[0]) * f, c0[1] + (c1[1] - c0[1]) * f, c0[2] + (c1[2] - c0[2]) * f];
    }
  }
  return STOPS_RGB[STOPS_RGB.length - 1][1];
}

/** Opacity for a coverage fraction: faint where rarely seen (the "transparent" end of the ramp). */
export function heatAlpha(v: number): number {
  const x = Math.min(1, Math.max(0, Number.isFinite(v) ? v : 0));
  return 0.2 + 0.8 * x;
}

/** Relative luminance (WCAG) of a 0..1 RGB colour. */
export function luminance([r, g, b]: RGB): number {
  const lin = (c: number) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/** Roving-tabindex tab navigation: index of the tab to focus after `key`, or null if the key isn't handled. */
export function nextTabIndex(key: string, current: number, count: number): number | null {
  if (count <= 0) return null;
  switch (key) {
    case "ArrowRight": case "ArrowDown": return (current + 1) % count;
    case "ArrowLeft": case "ArrowUp": return (current - 1 + count) % count;
    case "Home": return 0;
    case "End": return count - 1;
    default: return null;
  }
}

/** Renderer pixel ratio: cap at 1.5 on touch (coarse pointer) devices, 2 elsewhere. */
export function cappedPixelRatio(devicePixelRatio: number, coarsePointer: boolean): number {
  const dpr = Number.isFinite(devicePixelRatio) && devicePixelRatio > 0 ? devicePixelRatio : 1;
  return Math.min(dpr, coarsePointer ? 1.5 : 2);
}

/** Valid lab modes for ?mode= deep links. */
export const MODES = ["viewer", "planner", "coverage"] as const;
export type Mode = typeof MODES[number];
export function parseMode(s: string | null | undefined): Mode {
  return (MODES as readonly string[]).includes(s ?? "") ? (s as Mode) : "viewer";
}
