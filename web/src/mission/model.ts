// Mission model for the kids' planner: fuel units, launch-site physics, timing.
// 1 fuel unit = 100 m/s of delta-v.

import {
  eclipticToEquatorial, julianDay, lunarEarthElevation, lunarSunElevation, moonEcliptic, APOLLO11,
} from "./ephem.ts";

export const UNIT_KMS = 0.1;
export const toUnits = (kms: number) => kms / UNIT_KMS;

export interface Site {
  id: string; name: string; short_name: string; country: string; operator?: string;
  lat: number; lon: number;
  allowed_inclination_deg: [number, number] | null;
  typical_launch_direction?: string; famous_launches?: string[]; fun_fact?: string; why_here?: string;
  source_urls?: string[];
}

/** A place on the Moon (cislunar/research_data/lunar_sites.json). */
export interface LunarSite {
  id: string; name: string; mission: string; agency: string; country: string;
  kind: "historic" | "planned" | "candidate" | "crash";
  status: string; date: string | null; lat: number; lon: number;
  coord_quality: string; region: string; crewed: boolean;
  why_here: string; fun_fact: string; sources: string[]; label: string;
}

export const DEFAULT_LUNAR_SITE: LunarSite = {
  id: "apollo-11", name: "Tranquility Base", mission: "Apollo 11", agency: "NASA", country: "USA", kind: "historic",
  status: "landed 1969-07-20", date: "1969-07-20", lat: APOLLO11.lat, lon: APOLLO11.lon, coord_quality: "exact",
  region: "near-side", crewed: true, why_here: "", fun_fact: "", sources: [], label: "Fact",
};

/** Sites within this many degrees of the lunar equator are reached from the equatorial orbit; others need a polar orbit. */
export const EQUATORIAL_REACH_DEG = 10;
export const needsPolarOrbit = (ls: { lat: number }) => Math.abs(ls.lat) > EQUATORIAL_REACH_DEG;
/** Is Earth ever above the horizon here? The Moon's nodding (libration) shows up to ~8 deg past the edge. */
export const earthEverVisible = (ls: { lat: number; lon: number }) =>
  Math.cos((ls.lat * Math.PI) / 180) * Math.cos((ls.lon * Math.PI) / 180) > -0.14;
export const isPolarSite = (ls: { lat: number }) => Math.abs(ls.lat) >= 80;

const SIDEREAL_MONTH_D = 27.321661;

/** Unit vector to a lunar site in the CR3BP rotating frame (x away from Earth, z = orbit normal). */
export function siteRotFrame(ls: { lat: number; lon: number }): [number, number, number] {
  const la = (ls.lat * Math.PI) / 180, lo = (ls.lon * Math.PI) / 180;
  return [-Math.cos(la) * Math.cos(lo), -Math.cos(la) * Math.sin(lo), Math.sin(la)];
}

/** Days after arriving in lunar orbit until the orbit plane passes over the site, at least minDays.
 * The orbit plane stays fixed among the stars while the Moon turns once every 27.3 days,
 * so every site slides under a polar orbit twice a month (the poles are always under it). */
export function waitForSiteDays(llo: { r: number[]; v: number[] }, ls: { lat: number; lon: number }, minDays = 1): number {
  const [r, v] = [llo.r, llo.v];
  const n0 = [r[1] * v[2] - r[2] * v[1], r[2] * v[0] - r[0] * v[2], r[0] * v[1] - r[1] * v[0]];
  const nl = Math.hypot(n0[0], n0[1], n0[2]);
  const s = siteRotFrame(ls);
  if (Math.abs(n0[2] / nl) > 0.5 || isPolarSite(ls)) return minDays; // equatorial orbit, or a pole: the craft passes over soon
  const f = (d: number) => {
    const a = (-2 * Math.PI * d) / SIDEREAL_MONTH_D; // plane turns backwards relative to the Moon's surface
    const nx = Math.cos(a) * n0[0] - Math.sin(a) * n0[1], ny = Math.sin(a) * n0[0] + Math.cos(a) * n0[1];
    return (nx * s[0] + ny * s[1] + n0[2] * s[2]) / nl;
  };
  let prev = f(minDays);
  if (Math.abs(prev) < 0.004) return minDays;
  for (let d = minDays + 0.02; d < minDays + SIDEREAL_MONTH_D; d += 0.02) {
    const cur = f(d);
    if (Math.sign(cur) !== Math.sign(prev)) return d - (0.02 * cur) / (cur - prev);
    prev = cur;
  }
  return minDays;
}

export type DestId = "leo" | "geo" | "flyby" | "llo" | "surface" | "nrho" | "dro" | "l1halo" | "l2halo" | "l4";

/** Precomputed transfer from the Python engine (CR3BP), see cislunar/transfers.py */
export interface Transfer {
  dest: DestId;
  tli_kms: number;
  arrive_kms: number;        // insertion / LOI burn (0 for free return)
  tof_days: number;          // TLI to arrival (or to Earth return for the flyby)
  perilune_km?: number;
  times: number[];           // nondim, from TLI
  points: [number, number, number][]; // rotating frame, nondim
  orbit?: { slug: string; period: number; times: number[]; points: [number, number, number][]; start: number };
  llo?: { r: [number, number, number]; v: [number, number, number]; period_min: number };
  notes?: string;
}

// --- launch ---------------------------------------------------------------
/** Approximate delta-v from the pad to a 185 km orbit of inclination incDeg, including gravity
 * and drag losses (~1.5-2 km/s), minus the eastward push from Earth's spin that the orbit can use.
 * Calibrated so a due-east launch from Cape Canaveral (28.5 deg) needs ~9.4 km/s. */
export function launchKms(incDeg: number): number {
  return 9.80 - 0.4651 * Math.cos((incDeg * Math.PI) / 180);
}

/** Earth's spin bonus (km/s) available to an orbit of inclination incDeg. */
export const spinBonusKms = (incDeg: number) => 0.4651 * Math.cos((incDeg * Math.PI) / 180);

export function minInclination(site: Site): number {
  const lo = site.allowed_inclination_deg?.[0];
  return Math.max(Math.abs(site.lat), lo ?? Math.abs(site.lat));
}

export function maxInclination(site: Site): number {
  return site.allowed_inclination_deg?.[1] ?? 180;
}

// --- GEO ------------------------------------------------------------------
const MU_E = 398600.4418, RE = 6378.137, R_LEO = RE + 185, R_GEO = 42164;

export function geoBurns(incDeg: number): { gto: number; geo: number; planeChangeShare: number } {
  const vc = Math.sqrt(MU_E / R_LEO);
  const a = (R_LEO + R_GEO) / 2;
  const vp = Math.sqrt(MU_E * (2 / R_LEO - 1 / a));
  const va = Math.sqrt(MU_E * (2 / R_GEO - 1 / a));
  const vg = Math.sqrt(MU_E / R_GEO);
  const di = (incDeg * Math.PI) / 180;
  const geo = Math.sqrt(va * va + vg * vg - 2 * va * vg * Math.cos(di));
  return { gto: vp - vc, geo, planeChangeShare: geo - (vg - va) };
}

export function geoTransferOrbit() {
  const a = (R_LEO + R_GEO) / 2;
  return { a, e: (R_GEO - R_LEO) / (R_GEO + R_LEO), periodH: (2 * Math.PI * Math.sqrt(a ** 3 / MU_E)) / 3600 };
}

// --- plan -----------------------------------------------------------------
export interface Burn { phase: string; kms: number; units: number; label: string }

export interface Plan {
  dest: DestId;
  site: Site;
  launchDate: Date;          // UTC midnight of chosen day; actual liftoff time is computed
  inclination: number;
  incReason: "latitude" | "range" | "moon";
  moonDecAtArrival?: number;
  launch: { kms: number; units: number; spinBonusUnits: number };
  burns: Burn[];             // after reaching orbit
  totalUnits: number;        // after reaching orbit
  arrival?: Date;
  landingSunElev?: number;
  landingMorning?: boolean;
  landingSite?: LunarSite;
  landingDate?: Date;
  landingWaitDays?: number;   // days in lunar orbit before the descent
  landingEarthElev?: number;
  lunarOrbit?: "equatorial" | "polar";
  transferKey?: string;       // which precomputed transfer was used
}

export const ASCENT_MIN = 9;
export const PARKING_H = 2.5; // typical coast in parking orbit before TLI (illustrative)

/** Pick the precomputed transfer for a destination (landings far from the equator use the polar orbit). */
export function transferKeyFor(dest: DestId, ls?: { lat: number }): string {
  return dest === "surface" && ls && needsPolarOrbit(ls) ? "llo_polar" : dest;
}

export function plan(dest: DestId, site: Site, launchDate: Date, transfers: Record<string, Transfer>, landingSite: LunarSite = DEFAULT_LUNAR_SITE): Plan {
  const minInc = minInclination(site);
  let inc = minInc;
  let incReason: Plan["incReason"] = Math.abs(site.lat) >= minInc - 0.05 ? "latitude" : "range";
  const burns: Burn[] = [];
  let arrival: Date | undefined, moonDec: number | undefined, sunElev: number | undefined, morning: boolean | undefined;
  let landingDate: Date | undefined, waitDays: number | undefined, earthElev: number | undefined;
  let trKey: string | undefined, lunarOrbit: Plan["lunarOrbit"];

  if (dest === "geo") {
    const g = geoBurns(inc);
    burns.push({ phase: "gto", kms: g.gto, units: toUnits(g.gto), label: "Boost up toward GEO height" });
    burns.push({ phase: "geo", kms: g.geo, units: toUnits(g.geo), label: `Round out the orbit at GEO and remove ${inc.toFixed(1)}° of tilt` });
    arrival = new Date(launchDate.getTime() + (ASCENT_MIN / 60 + PARKING_H / 3 + geoTransferOrbit().periodH / 2) * 3600e3);
  } else if (dest !== "leo") {
    trKey = transferKeyFor(dest, landingSite);
    if (!transfers[trKey]) trKey = dest;
    const tr = transfers[trKey];
    const tArr = launchDate.getTime() + (ASCENT_MIN / 60 + PARKING_H + tr.tof_days * 24) * 3600e3;
    arrival = new Date(tArr);
    const jd = julianDay(arrival);
    const m = moonEcliptic(jd);
    moonDec = eclipticToEquatorial(m.lon, m.lat, jd).dec;
    // the parking orbit must pass over the point opposite the Moon, so its tilt must reach the Moon's declination
    if (Math.abs(moonDec) > inc) { inc = Math.abs(moonDec); incReason = "moon"; }
    burns.push({ phase: "tli", kms: tr.tli_kms, units: toUnits(tr.tli_kms), label: "Head for the Moon (trans-lunar injection)" });
    if (dest !== "flyby") {
      burns.push({ phase: dest === "llo" || dest === "surface" ? "loi" : "insert", kms: tr.arrive_kms, units: toUnits(tr.arrive_kms),
        label: dest === "llo" ? "Brake into Moon orbit (lunar orbit insertion)"
          : dest === "surface" ? `Brake into ${trKey === "llo_polar" ? "an orbit over the poles" : "an orbit over the equator"} (lunar orbit insertion)`
          : "Match the target orbit (orbit insertion)" });
    }
    if (dest === "surface") {
      const descent = 1.87; // LLO to surface powered descent, NASA (LEAG 2012 chart: 1.87-2.18 km/s)
      burns.push({ phase: "descent", kms: descent, units: toUnits(descent), label: "Land (powered descent)" });
      lunarOrbit = trKey === "llo_polar" ? "polar" : "equatorial";
      // Apollo landed about a day after reaching lunar orbit; a polar orbit may also wait for the site to turn under it
      waitDays = tr.llo ? waitForSiteDays(tr.llo, landingSite, 1) : 1;
      landingDate = new Date(tArr + waitDays * 86400e3);
      const jdL = julianDay(landingDate);
      const s = lunarSunElevation(jdL, landingSite.lat, landingSite.lon);
      sunElev = s.elev; morning = s.morning;
      earthElev = lunarEarthElevation(jdL, landingSite.lat, landingSite.lon);
    }
  }
  const lk = launchKms(inc);
  const total = burns.reduce((s, b) => s + b.units, 0);
  return {
    dest, site, launchDate, inclination: inc, incReason, moonDecAtArrival: moonDec,
    launch: { kms: lk, units: toUnits(lk), spinBonusUnits: toUnits(spinBonusKms(inc)) },
    burns, totalUnits: total, arrival, landingSunElev: sunElev, landingMorning: morning,
    ...(dest === "surface" ? { landingSite, landingDate, landingWaitDays: waitDays, landingEarthElev: earthElev, lunarOrbit } : {}),
    transferKey: trKey,
  };
}

/** "Good day" rating for a launch date: fuel within 0.5 unit of the month's best for this site,
 * and for landings, a morning Sun 5-20 degrees up at the landing site (like Apollo). */
export interface DayRating { date: Date; launchUnits: number; units: number; good: boolean; reason: string; sunElev?: number; earthElev?: number }

/** Landing-light verdict shared by the calendar and the challenges. */
export function landingVerdict(p: Pick<Plan, "landingSite" | "landingSunElev" | "landingMorning" | "landingEarthElev">): { ok: boolean; light: boolean; earth: boolean; text: string } {
  const ls = p.landingSite ?? DEFAULT_LUNAR_SITE;
  const e = p.landingSunElev ?? -90, ee = p.landingEarthElev ?? -90;
  const polar = isPolarSite(ls);
  const light = polar ? e > 0 : e >= 5 && e <= 20 && !!p.landingMorning;
  const needEarth = earthEverVisible(ls);
  const earth = !needEarth || ee > 0;
  let text: string;
  if (polar) text = e > 0 ? `Sun ${e.toFixed(1)}° above the horizon` : "The Sun is below the horizon here";
  else text = e < 0 ? "Dark at the landing site" : `Sun ${e.toFixed(0)}° up${p.landingMorning ? "" : " (afternoon)"}`;
  if (!needEarth) text += "; Earth never rises here, so you'd talk through a relay satellite";
  else text += ee > 0 ? `; Earth ${ee.toFixed(1)}° up for radio` : "; Earth below the horizon (no radio)";
  return { ok: light && earth, light, earth, text };
}

export function rateMonth(dest: DestId, site: Site, year: number, month: number, transfers: Record<string, Transfer>, landingSite: LunarSite = DEFAULT_LUNAR_SITE): DayRating[] {
  const days: DayRating[] = [];
  const n = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  for (let d = 1; d <= n; d++) {
    const date = new Date(Date.UTC(year, month, d));
    const p = plan(dest, site, date, transfers, landingSite);
    days.push({ date, launchUnits: p.launch.units, units: p.launch.units + p.totalUnits, good: false, reason: "", sunElev: p.landingSunElev, earthElev: p.landingEarthElev });
    if (dest === "surface") {
      const v = landingVerdict(p);
      const d = days[days.length - 1];
      d.good = v.ok; d.reason = v.text;
    }
  }
  const best = Math.min(...days.map(x => x.units));
  for (const x of days) {
    const fuelOk = x.units - best <= 0.5;
    if (dest === "surface") {
      x.good = fuelOk && x.good; // light and radio verdict set above
    } else {
      x.good = fuelOk;
      x.reason = fuelOk ? "Lowest fuel this month" : `+${(x.units - best).toFixed(1)} units: the Moon is far north or south in the sky`;
    }
  }
  return days;
}

// --- planner helpers (pure; used by the UI and the node tests) -------------
export const EXPLORER_TANK = 45;
export const LANDER_TANK = 65;
/** Landing needs the bigger stack: switching to "Land on the Moon" upgrades the tank (never downgrades). */
export function tankForDest(dest: DestId, current: number): number {
  return dest === "surface" ? Math.max(current, LANDER_TANK) : current;
}

const utcDay = (d: Date) => Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());

/** First good launch day on or after `from` (UTC day), searching up to `maxMonths` calendar months. */
export function nextGoodDay(dest: DestId, site: Site, from: Date, transfers: Record<string, Transfer>, landingSite: LunarSite = DEFAULT_LUNAR_SITE, maxMonths = 4): Date | null {
  const t0 = utcDay(from);
  let y = from.getUTCFullYear(), m = from.getUTCMonth();
  for (let k = 0; k < maxMonths; k++) {
    const hit = rateMonth(dest, site, y, m, transfers, landingSite).find(d => d.good && d.date.getTime() >= t0);
    if (hit) return hit.date;
    m++; if (m > 11) { m = 0; y++; }
  }
  return null;
}

/** Calendar marking: when every pickable day is equally good, marking them all says nothing. */
export function calendarMarks(days: DayRating[], today: Date): { allEqual: boolean; good: Set<number> } {
  const t0 = utcDay(today);
  const open = days.filter(d => d.date.getTime() >= t0);
  const allEqual = open.length > 0 && open.every(d => d.good);
  return { allEqual, good: new Set(allEqual ? [] : open.filter(d => d.good).map(d => d.date.getTime())) };
}

/** Plain-language landing verdict (the numbers stay in landingVerdict().text). */
export function landingPlain(p: Pick<Plan, "landingSite" | "landingSunElev" | "landingMorning" | "landingEarthElev">): string {
  const ls = p.landingSite ?? DEFAULT_LUNAR_SITE;
  const v = landingVerdict(p);
  const e = p.landingSunElev ?? -90;
  if (v.ok) {
    if (isPolarSite(ls)) return "Good day: the Sun and Earth are both above the horizon.";
    if (!earthEverVisible(ls)) return "Good day: low morning Sun, and a relay satellite carries your radio.";
    return "Good day: the Sun is low, so long shadows show the rocks.";
  }
  if (!v.light) {
    if (e < 0 || (isPolarSite(ls) && e <= 0)) return "Too dark: the Sun is down at the landing site. Pick a day with a check mark.";
    if (!p.landingMorning) return "Afternoon Sun: landers come down in the morning light. Pick a day with a check mark.";
    if (e > 20) return `Too bright: the Sun is high (${e.toFixed(0)}°), so shadows are short. Pick a day with a check mark.`;
    return "The Sun is too low: shadows would hide the ground. Pick a day with a check mark.";
  }
  return "No radio: Earth is below the horizon there. Pick a day with a check mark.";
}
