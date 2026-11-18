// Coverage model for cislunar space-domain awareness (pure functions; runs in a Web Worker).
//
// Frame: rotating Earth-Moon CR3BP frame, nondimensional distances. The Sun is treated as an
// infinitely distant source in the Earth-Moon plane, circling the frame once per synodic month.
// Simplifications (stated in the UI): no 5 deg lunar orbit tilt, no weather or daylight per site,
// diffuse-sphere targets, cylindrical shadows.

import { sampleAt, type Vec3 } from "./orbit.ts";

export const MAG_SUN = -26.74; // apparent magnitude of the Sun (arXiv 2408.06238)

export interface ObserverSpec {
  id: string;
  kind: "ground" | "geo" | "orbit";
  count: number;          // satellites evenly phased along the orbit
  limitingMag: number;
  // orbit observers
  points?: Vec3[]; times?: number[]; period?: number;
  mirrorY?: boolean;      // e.g. L5 from an L4 orbit
}

export interface Params {
  mu: number;
  lunitKm: number;
  tunitDays: number;
  rEarth: number; rMoon: number;        // nondim radii
  sunExclDeg: number; moonExclDeg: number; earthExclDeg: number; // space-based keep-outs (from limb)
  groundSunDeg: number; groundMoonDeg: number;                    // ground network keep-outs
  areaM2: number; albedo: number;
  days: number; steps: number;
  sun0Deg: number;                      // Sun direction at t=0, degrees from +x
}

export const SYNODIC_DAYS = 29.530589;
const GEO_KM = 42164;
const SIDEREAL_DAY_D = 0.99726968;

export function sunDir(p: Params, tDays: number): Vec3 {
  // in the rotating frame the Sun goes around clockwise once per synodic month
  const a = (p.sun0Deg * Math.PI) / 180 - (2 * Math.PI * tDays) / SYNODIC_DAYS;
  return [Math.cos(a), Math.sin(a), 0];
}

const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const norm = (a: Vec3) => Math.sqrt(dot(a, a));

export function angleDeg(a: Vec3, b: Vec3): number {
  const c = dot(a, b) / (norm(a) * norm(b));
  return (Math.acos(Math.max(-1, Math.min(1, c))) * 180) / Math.PI;
}

/** Does the segment a->b pass through a sphere (center c, radius r)? */
export function segmentHitsSphere(a: Vec3, b: Vec3, c: Vec3, r: number): boolean {
  const d = sub(b, a), f = sub(a, c);
  const dd = dot(d, d);
  let t = -dot(f, d) / dd;
  t = Math.max(0, Math.min(1, t));
  const q: Vec3 = [a[0] + d[0] * t - c[0], a[1] + d[1] * t - c[1], a[2] + d[2] * t - c[2]];
  return dot(q, q) < r * r;
}

/** Is point p in the (cylindrical) shadow of a body at c with radius r, Sun direction s? */
export function inShadow(p: Vec3, c: Vec3, r: number, s: Vec3): boolean {
  const v = sub(p, c);
  const along = dot(v, s);
  if (along > 0) return false; // sunward side
  const perp2 = dot(v, v) - along * along;
  return perp2 < r * r;
}

/** Apparent magnitude of a diffuse sphere (Frueh et al. 2021 form). distKm observer-target, phase in deg. */
export function sphereMagnitude(areaM2: number, albedo: number, distKm: number, phaseDeg: number): number {
  const a = (phaseDeg * Math.PI) / 180;
  const r2 = areaM2 / Math.PI; // r^2 from cross-section area
  const d = distKm * 1000;
  const f = (1 / (d * d)) * (2 / 3) * (albedo / (Math.PI * Math.PI)) * r2 * (Math.sin(a) + (Math.PI - a) * Math.cos(a));
  if (f <= 0) return Infinity;
  return MAG_SUN - 2.5 * Math.log10(f);
}

/** Observer positions (nondim, rotating frame) at time tDays. */
export function observerPositions(o: ObserverSpec, p: Params, tDays: number): Vec3[] {
  const earth: Vec3 = [-p.mu, 0, 0];
  if (o.kind === "ground") return [earth];
  const out: Vec3[] = [];
  for (let k = 0; k < o.count; k++) {
    if (o.kind === "geo") {
      const r = GEO_KM / p.lunitKm;
      const tN = tDays / p.tunitDays;
      const omega = (2 * Math.PI * p.tunitDays) / SIDEREAL_DAY_D; // GEO rate in nondim inertial
      const ang = (omega - 1) * tN + (2 * Math.PI * k) / o.count;
      out.push([earth[0] + r * Math.cos(ang), r * Math.sin(ang), 0]);
    } else {
      const T = o.period!;
      const tN = tDays / p.tunitDays + (T * k) / o.count;
      const q = sampleAt(o.points!, T, tN, o.times);
      out.push(o.mirrorY ? [q[0], -q[1], q[2]] : q);
    }
  }
  return out;
}

/** Can observer at `obs` (of spec o) see target `tgt` at this instant? */
export function canSee(o: ObserverSpec, obs: Vec3, tgt: Vec3, s: Vec3, p: Params): boolean {
  const earth: Vec3 = [-p.mu, 0, 0], moon: Vec3 = [1 - p.mu, 0, 0];
  // target must be sunlit
  if (inShadow(tgt, earth, p.rEarth, s) || inShadow(tgt, moon, p.rMoon, s)) return false;
  const los = sub(tgt, obs);
  const dist = norm(los);
  if (o.kind === "ground") {
    if (segmentHitsSphere(obs, tgt, moon, p.rMoon)) return false;
    if (angleDeg(los, s) < p.groundSunDeg) return false;
    const toMoon = sub(moon, obs);
    if (angleDeg(los, toMoon) < p.groundMoonDeg + (Math.asin(Math.min(1, p.rMoon / norm(toMoon))) * 180) / Math.PI) return false;
  } else {
    if (segmentHitsSphere(obs, tgt, earth, p.rEarth) || segmentHitsSphere(obs, tgt, moon, p.rMoon)) return false;
    if (angleDeg(los, s) < p.sunExclDeg) return false;
    const toMoon = sub(moon, obs), toEarth = sub(earth, obs);
    const moonR = (Math.asin(Math.min(1, p.rMoon / norm(toMoon))) * 180) / Math.PI;
    const earthR = (Math.asin(Math.min(1, p.rEarth / norm(toEarth))) * 180) / Math.PI;
    if (angleDeg(los, toMoon) < p.moonExclDeg + moonR) return false;
    if (angleDeg(los, toEarth) < p.earthExclDeg + earthR) return false;
  }
  // brightness: phase angle = Sun-target-observer
  const phase = angleDeg(s, sub(obs, tgt));
  return sphereMagnitude(p.areaM2, p.albedo, dist * p.lunitKm, phase) <= o.limitingMag;
}

export interface Grid { points: Vec3[]; nx: number; ny: number; nz: number }

export function makeGrid(nx: number, ny: number, nz: number, xr: [number, number], yr: [number, number], zr: [number, number]): Grid {
  const points: Vec3[] = [];
  for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const x = xr[0] + ((xr[1] - xr[0]) * (i + 0.5)) / nx;
    const y = yr[0] + ((yr[1] - yr[0]) * (j + 0.5)) / ny;
    const z = nz === 1 ? 0 : zr[0] + ((zr[1] - zr[0]) * (k + 0.5)) / nz;
    points.push([x, y, z]);
  }
  return { points, nx, ny, nz };
}

export interface TrackSpec { slug: string; points: Vec3[]; times: number[]; period: number }

const TRACK_PHASES = [0.125, 0.375, 0.625, 0.875];

export interface Result {
  coverage: Float32Array;            // fraction of time steps each grid point is seen by >= 1 observer
  tracks: Record<string, number>;    // fraction of time each target orbit is seen
  meanCoverage: number;
  fracAbove50: number;
  steps: number;
}

export function computeCoverage(grid: Grid, observers: ObserverSpec[], tracks: TrackSpec[], p: Params): Result {
  const n = grid.points.length;
  const hits = new Uint16Array(n);
  const trackHits: Record<string, number> = Object.fromEntries(tracks.map(t => [t.slug, 0]));
  for (let st = 0; st < p.steps; st++) {
    const tDays = (p.days * st) / p.steps;
    const s = sunDir(p, tDays);
    const obsList: { o: ObserverSpec; pos: Vec3 }[] = [];
    for (const o of observers) for (const pos of observerPositions(o, p, tDays)) obsList.push({ o, pos });
    for (let i = 0; i < n; i++) {
      const tgt = grid.points[i];
      for (const { o, pos } of obsList) if (canSee(o, pos, tgt, s, p)) { hits[i]++; break; }
    }
    // each target orbit is sampled at 4 phases (objects spread around it), so a target never
    // sits exactly on top of an observer flying the same orbit
    for (const t of tracks) {
      for (const ph of TRACK_PHASES) {
        const tgt = sampleAt(t.points, t.period, tDays / p.tunitDays + ph * t.period, t.times);
        for (const { o, pos } of obsList) if (canSee(o, pos, tgt, s, p)) { trackHits[t.slug] += 1 / TRACK_PHASES.length; break; }
      }
    }
  }
  const coverage = new Float32Array(n);
  let sum = 0, above = 0;
  for (let i = 0; i < n; i++) {
    coverage[i] = hits[i] / p.steps;
    sum += coverage[i];
    if (coverage[i] >= 0.5) above++;
  }
  const tr: Record<string, number> = {};
  for (const k in trackHits) tr[k] = trackHits[k] / p.steps;
  return { coverage, tracks: tr, meanCoverage: sum / n, fracAbove50: above / n, steps: p.steps };
}
