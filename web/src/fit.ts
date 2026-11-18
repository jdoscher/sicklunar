// Pure camera-fit maths for the 3D views (no DOM, no three.js), so node tests can cover it.
//
// The scene canvas fills the stage, but titles and toolbars sit over its top and bottom. The
// "clear area" is the part of the canvas no overlay covers. We centre the camera's view on the
// clear area (a view offset) and pick the camera distance so a set of points fits inside it.
//
// Points are given in the camera's basis, relative to the look point: x = right, y = up,
// z = towards the camera. A point's depth in front of the camera is dist - z.

export type P3 = [number, number, number];
export interface Rect { left: number; top: number; right: number; bottom: number }

/** Clear area of a w x h stage: below every top overlay and above every bottom overlay (stage px).
 *  `tops` are the bottom edges of the overlays along the top, `bottoms` the top edges of the ones
 *  along the bottom. Keeps at least `minH` px of height (overlays never squeeze it to nothing). */
export function clearArea(w: number, h: number, tops: number[], bottoms: number[], minH = 80): Rect {
  let top = Math.max(0, ...tops.filter(Number.isFinite));
  let bottom = Math.min(h, ...bottoms.filter(Number.isFinite));
  if (bottom - top < minH) {
    const mid = Math.min(h - minH / 2, Math.max(minH / 2, (top + bottom) / 2));
    top = Math.max(0, mid - minH / 2);
    bottom = Math.min(h, top + minH);
  }
  return { left: 0, top, right: w, bottom };
}

/** setViewOffset(w, h, x, y, w, h) values that move the camera's centre to the clear area's centre. */
export function viewOffset(w: number, h: number, clear: Rect): { x: number; y: number } {
  return { x: w / 2 - (clear.left + clear.right) / 2, y: h / 2 - (clear.top + clear.bottom) / 2 };
}

/** Focal length in px for a vertical field of view on a stage `h` px tall. */
export function focalPx(fovYDeg: number, h: number): number {
  return (h / 2) / Math.tan((fovYDeg * Math.PI) / 360);
}

/** Screen position (stage px) of a camera-basis point for camera distance `dist` and a pan of the
 *  look point (camera-basis x/y), with the view centre at (cx, cy). Null if behind the camera. */
export function project(p: P3, dist: number, pan: [number, number], F: number, cx: number, cy: number): [number, number] | null {
  const depth = dist - p[2];
  if (depth <= 1e-9) return null;
  return [cx + ((p[0] - pan[0]) * F) / depth, cy - ((p[1] - pan[1]) * F) / depth];
}

/** Screen-space bounding box of the points; null if any is behind the camera. */
export function screenBox(pts: P3[], dist: number, pan: [number, number], F: number, cx: number, cy: number): Rect | null {
  const box: Rect = { left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity };
  for (const p of pts) {
    const s = project(p, dist, pan, F, cx, cy);
    if (!s) return null;
    if (s[0] < box.left) box.left = s[0];
    if (s[0] > box.right) box.right = s[0];
    if (s[1] < box.top) box.top = s[1];
    if (s[1] > box.bottom) box.bottom = s[1];
  }
  return box;
}

const inside = (b: Rect, r: Rect) => b.left >= r.left - 1e-6 && b.right <= r.right + 1e-6 && b.top >= r.top - 1e-6 && b.bottom <= r.bottom + 1e-6;
/** Padding inside the clear area: one number for all sides, or per side (e.g. room for labels). */
export type Pad = number | Rect;
const shrink = (r: Rect, pad: Pad): Rect => {
  const p = typeof pad === "number" ? { left: pad, top: pad, right: pad, bottom: pad } : pad;
  const qx = (r.right - r.left) / 4, qy = (r.bottom - r.top) / 4;
  return { left: r.left + Math.min(p.left, qx), top: r.top + Math.min(p.top, qy), right: r.right - Math.min(p.right, qx), bottom: r.bottom - Math.min(p.bottom, qy) };
};

export interface Fit { dist: number; pan: [number, number]; box: Rect }

/** Camera distance and look-point pan that frame the points as large as possible inside the clear
 *  area (minus `pad` px), centred in it. Works for perspective cameras: the near side of an orbit
 *  draws larger than the far side, so the result is refined against the projected box. */
export function fitPoints(pts: P3[], F: number, clear: Rect, pad: Pad = 12): Fit {
  // the view centre is the clear area's centre (see viewOffset); the box is centred on the padded
  // target, which differs from it when the padding is uneven
  const cx = (clear.left + clear.right) / 2, cy = (clear.top + clear.bottom) / 2;
  const target = shrink(clear, pad);
  const tx = (target.left + target.right) / 2, ty = (target.top + target.bottom) / 2;
  const aw = target.right - target.left, ah = target.bottom - target.top;
  if (!pts.length) return { dist: 10, pan: [0, 0], box: { left: cx, top: cy, right: cx, bottom: cy } };
  let maxZ = -Infinity, r = 0;
  for (const p of pts) { maxZ = Math.max(maxZ, p[2]); r = Math.max(r, Math.hypot(p[0], p[1], p[2])); }
  r = Math.max(r, 1e-6);
  const pan: [number, number] = [0, 0];
  const lo0 = maxZ + r * 1e-3;
  let dist = lo0 + (2 * r * F) / Math.min(aw, ah);
  const sizeFits = (d: number) => {
    const b = screenBox(pts, d, pan, F, cx, cy);
    return !!b && b.right - b.left <= aw && b.bottom - b.top <= ah;
  };
  for (let iter = 0; iter < 8; iter++) {
    // smallest distance whose projected box is no bigger than the target
    let lo = lo0, hi = Math.max(dist, lo0 * 1.01 + r);
    let guard = 0;
    while (!sizeFits(hi) && guard++ < 60) hi *= 2;
    for (let k = 0; k < 50; k++) { const mid = (lo + hi) / 2; if (sizeFits(mid)) hi = mid; else lo = mid; }
    dist = hi;
    // pan so the projected box is centred on the target
    const b = screenBox(pts, dist, pan, F, cx, cy)!;
    const dx = (b.left + b.right) / 2 - tx, dy = (b.top + b.bottom) / 2 - ty;
    if (Math.abs(dx) < 0.25 && Math.abs(dy) < 0.25) break;
    pan[0] += (dx * dist) / F;
    pan[1] -= (dy * dist) / F;
  }
  // residual perspective error: back off until the box is inside
  let box = screenBox(pts, dist, pan, F, cx, cy)!;
  for (let k = 0; k < 60 && !inside(box, target); k++) { dist *= 1.01; box = screenBox(pts, dist, pan, F, cx, cy)!; }
  return { dist, pan, box };
}

/** Smallest camera distance (>= minDist) at which every point projects inside the clear area
 *  (minus `pad`), with the look point fixed at the clear area's centre. */
export function distToContain(pts: P3[], F: number, clear: Rect, pad: Pad, minDist: number): number {
  const cx = (clear.left + clear.right) / 2, cy = (clear.top + clear.bottom) / 2;
  const target = shrink(clear, pad);
  const ok = (d: number) => { const b = screenBox(pts, d, [0, 0], F, cx, cy); return !!b && inside(b, target); };
  if (!pts.length || ok(minDist)) return minDist;
  let lo = minDist, hi = Math.max(minDist * 2, 1e-6);
  let guard = 0;
  while (!ok(hi) && guard++ < 60) { lo = hi; hi *= 2; }
  for (let k = 0; k < 40; k++) { const mid = (lo + hi) / 2; if (ok(mid)) hi = mid; else lo = mid; }
  return hi;
}

/** Share of the clear area's width and height that a screen box fills (0..1 each). */
export function fillShare(box: Rect, clear: Rect): { w: number; h: number } {
  return { w: (box.right - box.left) / (clear.right - clear.left), h: (box.bottom - box.top) / (clear.bottom - clear.top) };
}
