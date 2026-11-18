// Mission geometry: turns a plan + precomputed CR3BP transfer into positions over time in an
// Earth-centered ecliptic frame (km). Pure math, no three.js, so node tests can run it.

import {
  equatorialToEcliptic, gmstDeg, julianDay, moonDirEcliptic, siteEquatorial, sunDirEcliptic,
} from "./ephem.ts";
import type { DestId, Plan, Transfer } from "./model.ts";
import { ASCENT_MIN, geoTransferOrbit, siteRotFrame } from "./model.ts";

export type V = [number, number, number];
const D2R = Math.PI / 180;
export const add = (a: V, b: V): V => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub = (a: V, b: V): V => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const mul = (a: V, k: number): V => [a[0] * k, a[1] * k, a[2] * k];
export const dot = (a: V, b: V) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a: V, b: V): V => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const len = (a: V) => Math.sqrt(dot(a, a));
export const unit = (a: V): V => mul(a, 1 / len(a));
const smooth = (x: number) => { const t = Math.min(1, Math.max(0, x)); return t * t * (3 - 2 * t); };

/** Rodrigues rotation of v about unit axis k by angle a. */
export function rotate(v: V, k: V, a: number): V {
  const c = Math.cos(a), s = Math.sin(a);
  return add(add(mul(v, c), mul(cross(k, v), s)), mul(k, dot(k, v) * (1 - c)));
}

export const RE = 6378.137, R_LEO = RE + 185, R_GEO = 42164, RM = 1737.4;
const MU_E = 398600.4418;
const W_LEO = Math.sqrt(MU_E / R_LEO ** 3); // rad/s

export interface System { mu: number; lunit_km: number; tunit_s: number }

export interface Event { t: number; phase: string; units: number; label: string }
export interface Segment { name: string; t0: number; t1: number; wall: number; focus: "earth" | "moon" | "both" | "craft"; zoom: number }

export interface Mission {
  liftoff: Date;
  end: number;                       // seconds after liftoff
  events: Event[];
  segments: Segment[];
  craft(t: number): V;               // km, Earth-centered ecliptic
  moon(t: number): V;
  moonAxes(t: number): { x: V; z: V }; // Moon body x (toward Earth) and north, for texture orientation
  sun(t: number): V;                 // unit vector toward the Sun
  earthRotationDeg(t: number): number; // GMST
  normal: V;                         // orbit-plane normal used to pick nice camera angles
  /** Moon-fixed (rotating) view: angle of the Earth-Moon line at time t, about `normal`. Absent for Earth-only trips. */
  moonAngle?: (t: number) => number;
  arrivalT?: number;
  failAt?: number;                   // time the mission stops (out of fuel)
  failPhase?: string;
  info: { parkingIncl: number; coastMin: number; tliTime?: Date; arrival?: Date; landing?: Date; perilune_km?: number };
}

// ------------------------------------------------------------------ helpers
function epoch(liftoff: Date, t: number) { return julianDay(new Date(liftoff.getTime() + t * 1000)); }

function eqToEcl(v: V, jd: number): V { return equatorialToEcliptic(v, jd) as V; }

/** Plane normals (equatorial frame) with inclination i that contain unit vector u. */
function planesThrough(u: V, iDeg: number): V[] {
  const i = iDeg * D2R;
  const rho = Math.hypot(u[0], u[1]);
  const phiU = Math.atan2(u[1], u[0]);
  // n = (sin i sinO, -sin i cosO, cos i);  n.u = 0  ->  sin i * rho * sin(O - phiU) = -cos i * u_z
  const s = (-Math.cos(i) * u[2]) / (Math.sin(i) * rho);
  if (Math.abs(s) > 1) return [];
  const a = Math.asin(s);
  return [a, Math.PI - a].map(d => {
    const O = phiU + d;
    return [Math.sin(i) * Math.sin(O), -Math.sin(i) * Math.cos(O), Math.cos(i)] as V;
  });
}

/** First time (s, within [t0, t0 + span]) when the launch site lies in the plane with normal n (equatorial). */
function siteCrossing(lat: number, lon: number, n: V, day0: Date, t0: number, span: number): number | null {
  const f = (t: number) => dot(siteEquatorial(lat, lon, julianDay(new Date(day0.getTime() + t * 1000))) as V, n);
  let prev = f(t0);
  let best = t0, bestAbs = Math.abs(prev);
  for (let t = t0 + 60; t <= t0 + span; t += 60) {
    const cur = f(t);
    if (prev === 0 || prev * cur < 0) {
      let a = t - 60, b = t;
      for (let k = 0; k < 30; k++) { const m = (a + b) / 2; if (f(a) * f(m) <= 0) b = m; else a = m; }
      return (a + b) / 2;
    }
    if (Math.abs(cur) < bestAbs) { bestAbs = Math.abs(cur); best = t; }
    prev = cur;
  }
  return bestAbs < 0.02 ? best : null; // grazing pass
}

// ------------------------------------------------------------------ transfer frame
interface TFrame { X: V; Y: V; Z: V; Tnd: number }

function transferFrame(arrival: Date): Omit<TFrame, "Tnd"> {
  const jd = julianDay(arrival);
  const x = unit(moonDirEcliptic(jd) as V);
  const x2 = unit(moonDirEcliptic(jd + 0.1) as V);
  const Z = unit(cross(x, x2));
  return { X: x, Y: cross(Z, x), Z };
}

function rotToEcl(f: TFrame, sys: System, p: V, tauNd: number): V {
  // rotating-frame point -> Earth-centered inertial (km) aligned so the Moon is on X at arrival
  const q: V = [p[0] + sys.mu, p[1], p[2]];
  const a = tauNd - f.Tnd, c = Math.cos(a), s = Math.sin(a);
  const r: V = [c * q[0] - s * q[1], s * q[0] + c * q[1], q[2]];
  return mul(add(add(mul(f.X, r[0]), mul(f.Y, r[1])), mul(f.Z, r[2])), sys.lunit_km);
}

function vecRotToEcl(f: TFrame, v: V, tauNd: number): V {
  const a = tauNd - f.Tnd, c = Math.cos(a), s = Math.sin(a);
  const r: V = [c * v[0] - s * v[1], s * v[0] + c * v[1], v[2]];
  return add(add(mul(f.X, r[0]), mul(f.Y, r[1])), mul(f.Z, r[2]));
}

function sampleArc(times: number[], pts: [number, number, number][], tau: number): V {
  if (tau <= times[0]) return pts[0] as V;
  const n = times.length - 1;
  if (tau >= times[n]) return pts[n] as V;
  let lo = 0, hi = n;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (times[m] <= tau) lo = m; else hi = m; }
  const a = (tau - times[lo]) / (times[hi] - times[lo]);
  const p = pts[lo], q = pts[hi];
  return [p[0] + (q[0] - p[0]) * a, p[1] + (q[1] - p[1]) * a, p[2] + (q[2] - p[2]) * a];
}

function sampleOrbit(o: NonNullable<Transfer["orbit"]>, tau: number): V {
  const u = ((tau % o.period) + o.period) % o.period;
  return sampleArc(o.times, o.points, u);
}

// ------------------------------------------------------------------ build
export function buildMission(p: Plan, tr: Transfer | undefined, sys: System, tankUnits: number): Mission {
  const site = p.site;
  const day0 = p.launchDate;
  const ascent = ASCENT_MIN * 60;
  const events: Event[] = [];
  const segments: Segment[] = [];
  const sunAt = (t: number) => unit(sunDirEcliptic(epoch(liftoff, t)) as V);
  let liftoff = new Date(day0.getTime() + 14 * 3600e3);

  // site direction (ecliptic) at a time after liftoff
  const siteAt = (t: number) => unit(eqToEcl(siteEquatorial(site.lat, site.lon, epoch(liftoff, t)) as V, epoch(liftoff, t)));

  // fuel bookkeeping: find the first burn the tank can't pay for
  let fuel = tankUnits, failAt: number | undefined, failPhase: string | undefined;
  const burn = (t: number, phase: string, units: number, label: string) => {
    if (failAt !== undefined) return;
    if (units > fuel + 1e-9) { failAt = t; failPhase = phase; return; }
    fuel -= units;
    events.push({ t, phase, units, label });
  };

  // ---------------- Earth-only missions
  if (p.dest === "leo" || p.dest === "geo") {
    // launch at 14:00 UTC on the chosen day, flying the direction that gives inclination i
    const lat = site.lat * D2R;
    const i = p.inclination * D2R;
    const sinA = Math.min(1, Math.cos(i) / Math.cos(lat));
    const A = Math.asin(sinA); // azimuth from north
    const r0 = siteEquatorial(site.lat, site.lon, julianDay(liftoff)) as V;
    const east = unit(cross([0, 0, 1], r0));
    const north = cross(r0, east);
    const vdir = add(mul(east, Math.sin(A)), mul(north, Math.cos(A) * (site.lat >= 0 ? 1 : 1)));
    const nEq = unit(cross(r0, vdir));
    const jd0 = julianDay(liftoff);
    const n = unit(eqToEcl(nEq, jd0));
    const ins = rotate(unit(eqToEcl(r0, jd0)), n, 18 * D2R);
    const parkPos = (t: number) => mul(rotate(ins, n, W_LEO * (t - ascent)), R_LEO);
    const ascentPos = ascentPath(siteAt, ins, ascent);
    events.push({ t: 0, phase: "launch", units: 0, label: "Liftoff" });
    events.push({ t: ascent, phase: "parking", units: 0, label: "In orbit" });
    segments.push({ name: "launch", t0: 0, t1: ascent, wall: 9, focus: "craft", zoom: 2.2 });

    if (p.dest === "leo") {
      const end = ascent + 2 * 2 * Math.PI / W_LEO;
      segments.push({ name: "parking", t0: ascent, t1: end, wall: 12, focus: "earth", zoom: 3.2 });
      events.push({ t: end, phase: "arrived", units: 0, label: "Mission complete" });
      return finish(end, (t) => (t < ascent ? ascentPos(t) : parkPos(t)), { parkingIncl: p.inclination, coastMin: 0 }, undefined, undefined, n);
    }
    // GEO: coast to the equator crossing (node), burn into GTO, apogee on the opposite node
    const eqN = unit(eqToEcl([0, 0, 1], jd0));
    const nodeDir = unit(cross(eqN, n)); // ascending node direction
    const ang = (u: V) => { // angle from insertion point to u along the orbit
      const a = Math.atan2(dot(cross(ins, u), n), dot(ins, u));
      return a < 0 ? a + 2 * Math.PI : a;
    };
    let nodeAng = Math.min(ang(nodeDir), ang(mul(nodeDir, -1)));
    if (p.inclination < 0.5) nodeAng = 0.3;
    const tGto = ascent + nodeAng / W_LEO;
    const perigeeDir = rotate(ins, n, nodeAng);
    const gto = geoTransferOrbit();
    const tApo = tGto + (gto.periodH / 2) * 3600;
    const apoDir = mul(perigeeDir, -1);
    const gtoPos = (t: number) => {
      const M = (Math.PI * (t - tGto)) / (tApo - tGto); // mean anomaly 0..pi
      let E = M;
      for (let k = 0; k < 20; k++) E = E - (E - gto.e * Math.sin(E) - M) / (1 - gto.e * Math.cos(E));
      const nu = 2 * Math.atan2(Math.sqrt(1 + gto.e) * Math.sin(E / 2), Math.sqrt(1 - gto.e) * Math.cos(E / 2));
      const r = gto.a * (1 - gto.e * Math.cos(E));
      return mul(rotate(perigeeDir, n, nu), r);
    };
    const wGeo = (2 * Math.PI) / 86164.1;
    const geoPos = (t: number) => mul(rotate(apoDir, eqN, wGeo * (t - tApo)), R_GEO);
    const [gtoBurn, geoBurn] = p.burns;
    burn(tGto, "gto", gtoBurn.units, gtoBurn.label);
    burn(tApo, "geo", geoBurn.units, geoBurn.label);
    const end = tApo + 24 * 3600;
    segments.push({ name: "parking", t0: ascent, t1: tGto, wall: 6, focus: "earth", zoom: 3.2 });
    segments.push({ name: "gto", t0: tGto, t1: tApo, wall: 12, focus: "earth", zoom: 16 });
    segments.push({ name: "geo", t0: tApo, t1: end, wall: 10, focus: "earth", zoom: 16 });
    if (failAt === undefined) events.push({ t: end, phase: "arrived", units: 0, label: "Parked over the equator" });
    return finish(end, (t) => t < ascent ? ascentPos(t) : t < tGto ? parkPos(t) : t < tApo ? gtoPos(t) : geoPos(t),
      { parkingIncl: p.inclination, coastMin: (tGto - ascent) / 60 }, undefined, undefined, unit(eqToEcl([0, 0, 1], jd0)));
  }

  // ---------------- Moon missions
  if (!tr) throw new Error("missing transfer for " + p.dest);
  const T = tr.times[tr.times.length - 1]; // nondim TOF
  const tu = sys.tunit_s;
  let coast = 2.5 * 3600, f: TFrame = { X: [1, 0, 0], Y: [0, 1, 0], Z: [0, 0, 1], Tnd: T };
  let nEcl: V = [0, 0, 1], u: V = [1, 0, 0], ins: V = [1, 0, 0];
  let tTli = 0;
  for (let iter = 0; iter < 4; iter++) {
    tTli = ascent + coast;
    const arrival = new Date(liftoff.getTime() + (tTli + T * tu) * 1000);
    f = { ...transferFrame(arrival), Tnd: T };
    u = unit(rotToEcl(f, sys, tr.points[0], 0));
    // parking plane (equatorial) containing u with the plan's inclination; choose the one best aligned with the arc
    const jdT = epoch(liftoff, tTli);
    const uEq = unit(eclToEq(u, jdT));
    const v0 = unit(sub(rotToEcl(f, sys, sampleArc(tr.times, tr.points, 1e-4), 1e-4), rotToEcl(f, sys, tr.points[0], 0)));
    const nArc = unit(cross(u, v0));
    // a plane tilted exactly at the site's latitude only grazes the site, so add a small margin
    let cands = planesThrough(uEq, Math.max(p.inclination, Math.abs(site.lat) + 0.3, Math.abs(Math.asin(uEq[2]) / D2R) + 0.01));
    if (!cands.length) cands = [unit(eclToEq(nArc, jdT))];
    const nEqBest = cands.map(c => unit(eqToEcl(c, jdT))).sort((a, b) => dot(b, nArc) - dot(a, nArc))[0];
    nEcl = nEqBest;
    // liftoff when the site passes through that plane (search the chosen UTC day)
    const nEq = unit(eclToEq(nEcl, jdT));
    const tx = siteCrossing(site.lat, site.lon, nEq, day0, 0, 86400);
    liftoff = new Date(day0.getTime() + (tx ?? 14 * 3600) * 1000);
    // coast from the insertion point to u
    const s0 = siteAt(0);
    const sIn = unit(sub(s0, mul(nEcl, dot(s0, nEcl))));
    ins = rotate(sIn, nEcl, 18 * D2R);
    let ang = Math.atan2(dot(cross(ins, u), nEcl), dot(ins, u));
    if (ang < 0.35) ang += 2 * Math.PI; // at least ~20 minutes of coasting
    coast = ang / W_LEO;
  }
  tTli = ascent + coast;
  const tArr = tTli + T * tu;
  const arcPlane = unit(cross(u, unit(sub(rotToEcl(f, sys, sampleArc(tr.times, tr.points, 1e-4), 1e-4), rotToEcl(f, sys, tr.points[0], 0)))));
  const phi = Math.atan2(dot(cross(arcPlane, nEcl), u), dot(arcPlane, nEcl));
  const blendEnd = 0.35 * T;
  const arcPos = (tau: number): V => {
    const raw = rotToEcl(f, sys, sampleArc(tr.times, tr.points, tau), tau);
    const k = 1 - smooth(tau / blendEnd);
    return k > 0 ? rotate(raw, u, phi * k) : raw;
  };
  const parkPos = (t: number) => mul(rotate(ins, nEcl, W_LEO * (t - ascent)), R_LEO);
  const ascentPos = ascentPath(siteAt, ins, ascent);
  const moonPos = (t: number) => rotToEcl(f, sys, [1 - sys.mu, 0, 0], (t - tTli) / tu);

  events.push({ t: 0, phase: "launch", units: 0, label: "Liftoff" });
  events.push({ t: ascent, phase: "parking", units: 0, label: "In orbit" });
  segments.push({ name: "launch", t0: 0, t1: ascent, wall: 9, focus: "craft", zoom: 2.2 });
  segments.push({ name: "parking", t0: ascent, t1: tTli, wall: 6, focus: "earth", zoom: 3.2 });
  const tliBurn = p.burns.find(b => b.phase === "tli")!;
  burn(tTli, "tli", tliBurn.units, tliBurn.label);
  const coastWall = Math.min(40, 12 + 2.2 * tr.tof_days);
  let craft: (t: number) => V;
  let end: number;
  let landing: Date | undefined;

  if (p.dest === "flyby") {
    const tFly = tTli + (tr as Transfer & { flyby_day: number }).flyby_day * 86400;
    end = tArr;
    events.push({ t: tFly, phase: "flyby", units: 0, label: "Around the far side of the Moon" });
    segments.push({ name: "coast", t0: tTli, t1: tFly - 8 * 3600, wall: coastWall * 0.45, focus: "both", zoom: 1 });
    segments.push({ name: "flyby", t0: tFly - 8 * 3600, t1: tFly + 8 * 3600, wall: 8, focus: "moon", zoom: 14 });
    segments.push({ name: "return", t0: tFly + 8 * 3600, t1: end, wall: coastWall * 0.45, focus: "both", zoom: 1 });
    events.push({ t: end, phase: "splashdown", units: 0, label: "Re-entry and splashdown" });
    craft = (t) => t < ascent ? ascentPos(t) : t < tTli ? parkPos(t) : arcPos((t - tTli) / tu);
  } else if (p.dest === "llo" || p.dest === "surface") {
    const llo = (tr as Transfer & { llo: { r: V; v: V; period_min: number } }).llo;
    const rHat = unit(vecRotToEcl(f, llo.r, T));
    const vHat = unit(sub(vecRotToEcl(f, llo.v, T), mul(rHat, dot(vecRotToEcl(f, llo.v, T), rHat))));
    const P = llo.period_min * 60;
    const lloPos = (t: number) => add(moonPos(t), mul(add(mul(rHat, Math.cos((2 * Math.PI * (t - tArr)) / P)), mul(vHat, Math.sin((2 * Math.PI * (t - tArr)) / P))), RM + 100));
    const loi = p.burns.find(b => b.phase === "loi")!;
    burn(tArr, "loi", loi.units, loi.label);
    segments.push({ name: "coast", t0: tTli, t1: tArr - 6 * 3600, wall: coastWall, focus: "both", zoom: 1 });
    segments.push({ name: "approach", t0: tArr - 6 * 3600, t1: tArr, wall: 5, focus: "moon", zoom: 12 });
    if (p.dest === "llo") {
      end = tArr + 2 * P;
      segments.push({ name: "orbit", t0: tArr, t1: end, wall: 10, focus: "moon", zoom: 4 });
      events.push({ t: end, phase: "arrived", units: 0, label: "In low lunar orbit" });
      craft = (t) => t < ascent ? ascentPos(t) : t < tTli ? parkPos(t) : t < tArr ? arcPos((t - tTli) / tu) : lloPos(t);
    } else {
      const ls = p.landingSite ?? { lat: 0.674, lon: 23.473, name: "Tranquility Base" };
      const siteRot: V = siteRotFrame(ls);
      const sitePos = (t: number) => add(moonPos(t), mul(unit(vecRotToEcl(f, siteRot, (t - tTli) / tu)), RM));
      // land when the orbit passes right over the site, near the time the plane lines up with it
      const tAlign = tArr + (p.landingWaitDays ?? 1) * 86400;
      let tLand = tAlign, bestDot = -2;
      for (let k = -100; k <= 100; k++) {
        const t = tAlign + (k / 100) * P;
        if (t < tArr + 3 * 3600) continue;
        const d = dot(unit(sub(lloPos(t), moonPos(t))), unit(sub(sitePos(t), moonPos(t))));
        if (d > bestDot) { bestDot = d; tLand = t; }
      }
      const tDesc = tLand - 12 * 60;
      const descPos = (t: number) => {
        const s = smooth((t - tDesc) / (tLand - tDesc));
        const m = moonPos(t);
        const a = unit(sub(lloPos(t), m)), b = unit(sub(sitePos(t), m));
        const dir = unit(add(mul(a, 1 - s), mul(b, s)));
        return add(m, mul(dir, RM + 100 * (1 - s) ** 1.5));
      };
      const desc = p.burns.find(b => b.phase === "descent")!;
      end = tLand + 3 * 3600;
      // long waits: show a few laps quickly while the Moon turns underneath (the orbit plane stays put among the stars)
      const tW0 = tArr + 2 * P;
      const K = (p.landingWaitDays ?? 1) > 1.2 ? Math.floor((tDesc - 0.5 * P - tW0) / P) : 0;
      const tW1 = tW0 + Math.max(0, K) * P;
      const LAPS = 3;
      const waitPos = (t: number) => {
        const fake = tW0 + ((t - tW0) / (tW1 - tW0)) * LAPS * P;
        return add(moonPos(t), sub(lloPos(fake), moonPos(fake)));
      };
      segments.push({ name: "orbit", t0: tArr, t1: K >= 1 ? tW0 : tDesc, wall: 8, focus: "moon", zoom: 1.4 });
      if (K >= 1) {
        events.push({ t: tW0, phase: "wait", units: 0, label: "Waiting for the landing site" });
        segments.push({ name: "wait", t0: tW0, t1: tW1, wall: Math.min(10, 4 + (tW1 - tW0) / 86400), focus: "moon", zoom: 1.4 });
        segments.push({ name: "orbit", t0: tW1, t1: tDesc, wall: 4, focus: "moon", zoom: 1.4 });
      }
      burn(tDesc, "descent", desc.units, desc.label);
      segments.push({ name: "descent", t0: tDesc, t1: tLand, wall: 8, focus: "craft", zoom: 0.8 });
      segments.push({ name: "landed", t0: tLand, t1: end, wall: 4, focus: "craft", zoom: 0.8 });
      landing = new Date(liftoff.getTime() + tLand * 1000);
      if (failAt === undefined) events.push({ t: tLand, phase: "landed", units: 0, label: `Touchdown at ${"name" in ls ? ls.name : "the landing site"}` });
      const lloOrWait = (t: number) => (K >= 1 && t >= tW0 && t < tW1 ? waitPos(t) : lloPos(t));
      craft = (t) => t < ascent ? ascentPos(t) : t < tTli ? parkPos(t) : t < tArr ? arcPos((t - tTli) / tu) : t < tDesc ? lloOrWait(t) : t < tLand ? descPos(t) : sitePos(t);

    }
  } else {
    const o = tr.orbit!;
    const ins2 = p.burns.find(b => b.phase === "insert")!;
    burn(tArr, "insert", ins2.units, ins2.label);
    const loopT = Math.min(2 * o.period * tu, 40 * 86400);
    end = tArr + loopT;
    const orbitPos = (t: number) => {
      const tau = (t - tTli) / tu;
      return rotToEcl(f, sys, sampleOrbit(o, o.start + (tau - T)), tau);
    };
    segments.push({ name: "coast", t0: tTli, t1: tArr, wall: coastWall, focus: "both", zoom: 1 });
    let rMax = 0;
    for (const q of o.points) rMax = Math.max(rMax, Math.hypot(q[0] - (1 - sys.mu), q[1], q[2]));
    const zoom = Math.max(2.2, (rMax * sys.lunit_km * 3.2) / 10000);
    segments.push({ name: "orbit", t0: tArr, t1: end, wall: 14, focus: p.dest === "l4" ? "both" : "moon", zoom: p.dest === "l4" ? 1 : zoom });
    events.push({ t: end, phase: "arrived", units: 0, label: "On station" });
    craft = (t) => t < ascent ? ascentPos(t) : t < tTli ? parkPos(t) : t < tArr ? arcPos((t - tTli) / tu) : orbitPos(t);
  }
  return finish(end, craft, {
    parkingIncl: p.inclination, coastMin: coast / 60,
    tliTime: new Date(liftoff.getTime() + tTli * 1000), arrival: new Date(liftoff.getTime() + tArr * 1000), landing,
    perilune_km: tr.perilune_km,
  }, moonPos, (t) => {
    const m = moonPos(t);
    const x = unit(mul(m, -1));
    return { x, z: f.Z };
  }, f.Z, (t) => (t - tTli) / tu, tArr);

  function finish(end: number, craft: (t: number) => V, info: Mission["info"],
    moon?: (t: number) => V, moonAxes?: (t: number) => { x: V; z: V }, normal: V = [0, 0, 1],
    moonAngle?: (t: number) => number, arrivalT?: number): Mission {
    const moonEph = (t: number) => mul(unit(moonDirEcliptic(epoch(liftoff, t)) as V), 384400);
    const mF = moon ?? moonEph;
    const fail = failAt;
    return {
      liftoff, end: fail ?? end, events: events.sort((a, b) => a.t - b.t), segments: clipSegments(segments, fail ?? end),
      craft, moon: mF, normal, moonAngle, arrivalT,
      moonAxes: moonAxes ?? ((t) => ({ x: unit(mul(mF(t), -1)), z: [0, 0, 1] })),
      sun: sunAt, earthRotationDeg: (t) => gmstDeg(epoch(liftoff, t)),
      failAt: fail, failPhase, info,
    };
  }
}

function clipSegments(segs: Segment[], end: number): Segment[] {
  const out: Segment[] = [];
  for (const s of segs) {
    if (s.t0 >= end) break;
    if (s.t1 > end) { out.push({ ...s, t1: end, wall: Math.max(2, s.wall * (end - s.t0) / (s.t1 - s.t0)) }); break; }
    out.push(s);
  }
  return out;
}

function eclToEq(v: V, jd: number): V {
  // inverse of equatorialToEcliptic (rotation about x by obliquity)
  const e = (23.439291 - 0.0130042 * ((jd - 2451545) / 36525)) * D2R;
  return [v[0], Math.cos(e) * v[1] - Math.sin(e) * v[2], Math.sin(e) * v[1] + Math.cos(e) * v[2]];
}

/** Ascent: rise steeply, then pitch over toward the insertion point. */
function ascentPath(siteAt: (t: number) => V, ins: V, ascent: number) {
  return (t: number): V => {
    const s = Math.min(1, Math.max(0, t / ascent));
    const from = siteAt(t);
    const w = smooth(s);
    const dir = unit(add(mul(from, 1 - w), mul(ins, w)));
    const h = 185 * Math.pow(Math.sin((Math.PI / 2) * s), 0.7);
    return mul(dir, RE + h);
  };
}

// ------------------------------------------------------------------ playback
/** Map wall-clock seconds to mission seconds through the segments (piecewise linear). */
export function wallToMission(segs: Segment[], w: number): number {
  let acc = 0;
  for (const s of segs) {
    if (w <= acc + s.wall) return s.t0 + ((w - acc) / s.wall) * (s.t1 - s.t0);
    acc += s.wall;
  }
  return segs.length ? segs[segs.length - 1].t1 : 0;
}

export function missionToWall(segs: Segment[], t: number): number {
  let acc = 0;
  for (const s of segs) {
    if (t <= s.t1) return acc + ((t - s.t0) / (s.t1 - s.t0)) * s.wall;
    acc += s.wall;
  }
  return acc;
}

export const totalWall = (segs: Segment[]) => segs.reduce((a, s) => a + s.wall, 0);

export function segmentAt(segs: Segment[], t: number): Segment {
  return segs.find(s => t <= s.t1) ?? segs[segs.length - 1];
}

export type { DestId };
