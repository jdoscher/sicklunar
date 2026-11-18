// Inline SVG line icons for the Orbit lab (no emoji). Decorative: always aria-hidden, paired with text or an aria-label.
const svg = (body: string, cls = "i") =>
  `<svg class="${cls}" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${body}</svg>`;

export const ICONS = {
  play: svg(`<path d="M8 5.5v13l10.5-6.5z" fill="currentColor" stroke="none"/>`),
  pause: svg(`<rect x="6.5" y="5" width="3.5" height="14" rx="1" fill="currentColor" stroke="none"/><rect x="14" y="5" width="3.5" height="14" rx="1" fill="currentColor" stroke="none"/>`),
  chevronDown: svg(`<path d="M6 9l6 6 6-6"/>`),
  chevronUp: svg(`<path d="M6 15l6-6 6 6"/>`),
  swap: svg(`<path d="M8 4v16M8 4L4.5 7.5M8 4l3.5 3.5M16 20V4M16 20l-3.5-3.5M16 20l3.5-3.5"/>`),
  external: svg(`<path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>`),
  run: svg(`<circle cx="12" cy="12" r="8"/><path d="M12 12l5-3M12 4v2M20 12h-2M12 20v-2M4 12h2"/>`),
};
