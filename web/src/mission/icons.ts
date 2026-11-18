// Inline SVG icons for the Mission Planner (no emoji anywhere in the UI).
// Destination glyphs (g-*) are tiny orbit diagrams: Earth = filled dot, Moon = outlined circle.
// UI icons (i-*) are 24-grid line icons. All use currentColor and are aria-hidden.

export const SPRITE = `<svg xmlns="http://www.w3.org/2000/svg" width="0" height="0" style="position:absolute" aria-hidden="true">
  <symbol id="g-leo" viewBox="0 0 32 32"><g fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><circle cx="16" cy="16" r="5.5" fill="currentColor" stroke="none"/><ellipse cx="16" cy="16" rx="11" ry="4.2" transform="rotate(-18 16 16)"/></g></symbol>
  <symbol id="g-geo" viewBox="0 0 32 32"><g fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="16" cy="16" r="3.6" fill="currentColor" stroke="none"/><circle cx="16" cy="16" r="12"/><rect x="26.2" y="14.2" width="3.6" height="3.6" fill="currentColor" stroke="none"/></g></symbol>
  <symbol id="g-flyby" viewBox="0 0 32 32"><g fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><circle cx="5.5" cy="16" r="3.2" fill="currentColor" stroke="none"/><circle cx="25" cy="16" r="2.6"/><path d="M8.6 14.2C14 9.5 23.5 8.6 28.4 13c2.4 2.4 1.2 6.4-3 6.9C19.5 20.8 13.5 19.9 8.6 17.8"/></g></symbol>
  <symbol id="g-llo" viewBox="0 0 32 32"><g fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="16" cy="16" r="6.5"/><circle cx="16" cy="16" r="11" stroke-dasharray="2.5 2.5"/><circle cx="27" cy="16" r="1.8" fill="currentColor" stroke="none"/></g></symbol>
  <symbol id="g-surface" viewBox="0 0 32 32"><g fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M2.5 27.5Q16 22 29.5 27.5"/><path d="M12.5 13.5h7l1.5 5h-10z"/><path d="M12 18.5l-2.5 4.5M20 18.5l2.5 4.5M16 13.5V9"/><path d="M16 9h4.5v2.6H16" fill="currentColor"/></g></symbol>
  <symbol id="g-nrho" viewBox="0 0 32 32"><g fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="16" cy="4.6" r="2.6"/><ellipse cx="16" cy="18.5" rx="4.6" ry="11"/></g></symbol>
  <symbol id="g-dro" viewBox="0 0 32 32"><g fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="16" cy="16" r="2.8"/><ellipse cx="16" cy="16" rx="13" ry="7.5"/><path d="M18.6 6.4L16 8.5l2.6 2.1"/></g></symbol>
  <symbol id="g-l1" viewBox="0 0 32 32"><g fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><circle cx="4" cy="16" r="3.2" fill="currentColor" stroke="none"/><circle cx="28.5" cy="16" r="2.2"/><ellipse cx="20.5" cy="16" rx="2.8" ry="7"/><path d="M19.4 16h2.2" /></g></symbol>
  <symbol id="g-l2" viewBox="0 0 32 32"><g fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><circle cx="2.8" cy="16" r="1.8" fill="currentColor" stroke="none"/><circle cx="12" cy="16" r="2.6"/><ellipse cx="23.5" cy="16" rx="3.2" ry="8.5"/><path d="M22.4 16h2.2"/></g></symbol>
  <symbol id="g-l4" viewBox="0 0 32 32"><g fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><circle cx="13" cy="21" r="3.2" fill="currentColor" stroke="none"/><path d="M26 21A13 13 0 0 0 4.2 11.4" stroke-dasharray="2 2.4"/><circle cx="26" cy="21" r="2.2"/><ellipse cx="19.5" cy="9.7" rx="4.6" ry="1.9" transform="rotate(-28 19.5 9.7)"/></g></symbol>

  <symbol id="i-rocket" viewBox="0 0 24 24"><g fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2.8c3.2 2.8 4.3 7 3.6 12.2H8.4C7.7 9.8 8.8 5.6 12 2.8z"/><path d="M8.6 12.6L5.8 16.4l2.8-.4M15.4 12.6l2.8 3.8-2.8-.4"/><circle cx="12" cy="8.8" r="1.4"/><path d="M10.6 18.2L12 21.2l1.4-3"/></g></symbol>
  <symbol id="i-fuel" viewBox="0 0 24 24"><g fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="3.5" width="12" height="17" rx="2.5"/><path d="M6 13h12"/><path d="M9 16.5h6"/></g></symbol>
  <symbol id="i-burn" viewBox="0 0 24 24"><path fill="none" stroke="currentColor" stroke-width="1.75" stroke-linejoin="round" d="M12 2.8c1.6 3.6 5.6 5.6 5.6 10.6a5.6 5.6 0 0 1-11.2 0c0-2.8 1.6-4.6 2.8-6 .5 1.8 1.4 2.8 2.6 3.2.3-2.6-.4-5.2.2-7.8z"/></symbol>
  <symbol id="i-badge" viewBox="0 0 24 24"><g fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="14.5" r="6"/><path d="M8.5 9.6L6.5 3h4l1.5 4.4L13.5 3h4l-2 6.6"/><path d="M12 11.8l.9 1.8 2 .3-1.45 1.4.35 2-1.8-.95-1.8.95.35-2L9.1 13.9l2-.3z" fill="currentColor" stroke-width="1"/></g></symbol>
  <symbol id="i-why" viewBox="0 0 24 24"><g fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M9.6 9.4a2.5 2.5 0 1 1 3.4 2.4c-.7.3-1 .8-1 1.6v.4"/><circle cx="12" cy="16.9" r=".6" fill="currentColor"/></g></symbol>
  <symbol id="i-play" viewBox="0 0 24 24"><path d="M8 5.2v13.6L19 12z" fill="currentColor"/></symbol>
  <symbol id="i-pause" viewBox="0 0 24 24"><g fill="currentColor"><rect x="6.5" y="5" width="4" height="14" rx="1"/><rect x="13.5" y="5" width="4" height="14" rx="1"/></g></symbol>
  <symbol id="i-camera" viewBox="0 0 24 24"><g fill="none" stroke="currentColor" stroke-width="1.75" stroke-linejoin="round"><rect x="3" y="7" width="12.5" height="10" rx="2"/><path d="M15.5 10.5L21 7.5v9l-5.5-3z"/></g></symbol>
  <symbol id="i-frame" viewBox="0 0 24 24"><g fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"><circle cx="6" cy="12" r="2.6" fill="currentColor" stroke="none"/><circle cx="18" cy="12" r="1.8"/><path d="M3 5.5h18M3 18.5h18" stroke-dasharray="1.5 2.5"/></g></symbol>
  <symbol id="i-edit" viewBox="0 0 24 24"><g fill="none" stroke="currentColor" stroke-width="1.75" stroke-linejoin="round" stroke-linecap="round"><path d="M4 20l.6-4L15.4 5.2l3.4 3.4L8 19.4z"/><path d="M13.2 7.4l3.4 3.4"/></g></symbol>
  <symbol id="i-close" viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"/></symbol>
  <symbol id="i-chev-l" viewBox="0 0 24 24"><path d="M14.5 6l-6 6 6 6" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/></symbol>
  <symbol id="i-chev-r" viewBox="0 0 24 24"><path d="M9.5 6l6 6-6 6" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/></symbol>
  <symbol id="i-chev-d" viewBox="0 0 24 24"><path d="M6 9.5l6 6 6-6" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/></symbol>
  <symbol id="i-check" viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></symbol>
  <symbol id="i-pin" viewBox="0 0 24 24"><g fill="none" stroke="currentColor" stroke-width="1.75"><path d="M12 21s-6.5-6-6.5-11a6.5 6.5 0 0 1 13 0c0 5-6.5 11-6.5 11z"/><circle cx="12" cy="10" r="2.2"/></g></symbol>
  <symbol id="i-calendar" viewBox="0 0 24 24"><g fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"><rect x="3.5" y="5" width="17" height="15" rx="2"/><path d="M3.5 9.5h17M8 3v4M16 3v4"/></g></symbol>
  <symbol id="i-ext" viewBox="0 0 24 24"><path d="M8 16L16 8M9.5 8H16v6.5" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/></symbol>
  <symbol id="i-replay" viewBox="0 0 24 24"><g fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M4.5 12a7.5 7.5 0 1 0 2.2-5.3"/><path d="M4.5 4v4h4"/></g></symbol>
  <symbol id="i-speed" viewBox="0 0 24 24"><g fill="currentColor"><path d="M4 6.5v11l7-5.5zM12.5 6.5v11l7-5.5z"/></g></symbol>
  <symbol id="i-orbit" viewBox="0 0 24 24"><g fill="none" stroke="currentColor" stroke-width="1.75"><circle cx="12" cy="12" r="2.5" fill="currentColor" stroke="none"/><ellipse cx="12" cy="12" rx="9" ry="4.5" transform="rotate(-25 12 12)"/></g></symbol>
  <symbol id="i-search" viewBox="0 0 24 24"><g fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"><circle cx="10.5" cy="10.5" r="6"/><path d="M15 15l5 5"/></g></symbol>
  <symbol id="i-motion" viewBox="0 0 24 24"><g fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"><circle cx="15" cy="12" r="5"/><path d="M3 9h5M2 12h5M3 15h5"/></g></symbol>
  <symbol id="i-alert" viewBox="0 0 24 24"><g fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3.5L21.5 20h-19z"/><path d="M12 10v4.5"/><circle cx="12" cy="17.3" r=".6" fill="currentColor"/></g></symbol>
  <symbol id="i-star" viewBox="0 0 24 24"><path d="M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.8L12 16.8l-5.2 2.8 1-5.8-4.3-4.1 5.9-.8z" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linejoin="round"/></symbol>
</svg>
`;

/** <svg><use> for a sprite symbol. Icons are decorative: always pair them with text. */
export const icon = (id: string, cls = "i") => `<svg class="${cls}" aria-hidden="true" focusable="false"><use href="#${id}"/></svg>`;

export function mountSprite(): void {
  if (document.getElementById("mp-sprite")) return;
  const d = document.createElement("div");
  d.id = "mp-sprite";
  d.innerHTML = SPRITE;
  document.body.prepend(d);
}
