// Transfer planner: enumerate routes over the cited delta-v/time table, keep the Pareto front.

export interface Node { id: string; name: string; type: string }
export interface Leg {
  from: string; to: string;
  dv_kms_min: number; dv_kms_max: number;
  tof_days_min: number | null; tof_days_max: number | null;
  method: string; source_url: string; label: string;
  reversed?: boolean; note?: string;
}
export interface Transfers { nodes: Node[]; legs: Leg[] }

export interface Options {
  allowAerocapture: boolean;   // legs that rely on Earth's atmosphere to brake
  allowSlow: boolean;          // legs longer than slowDays (low-energy transfers)
  slowDays: number;
  includeInference: boolean;   // legs the research labelled Inference (computed, not published)
  includeMassDriver: boolean;  // electric launch from the Moon (no propellant, no funded program)
  allowReverse: boolean;       // use a published leg backwards (same delta-v/time) when no reverse leg is published
  estimate: "min" | "max";     // optimistic or conservative end of each published range
  maxLegs: number;
}

export const DEFAULT_OPTIONS: Options = {
  allowAerocapture: true, allowSlow: true, slowDays: 30, includeInference: true,
  includeMassDriver: false, allowReverse: true, estimate: "min", maxLegs: 5,
};

export interface Route { legs: Leg[]; dv: number; days: number; unknownTime: boolean }

export const isAerocapture = (l: Leg) => /aerocapture|aerobrak/i.test(l.method);
export const isMassDriver = (l: Leg) => /mass driver/i.test(l.method);
export const legDv = (l: Leg, o: Options) => (o.estimate === "min" ? l.dv_kms_min : l.dv_kms_max);
export const legDays = (l: Leg, o: Options) =>
  o.estimate === "min" ? (l.tof_days_min ?? l.tof_days_max) : (l.tof_days_max ?? l.tof_days_min);

export function usable(l: Leg, o: Options): boolean {
  if (!o.allowAerocapture && isAerocapture(l)) return false;
  if (!o.includeInference && /^inference/i.test(l.label)) return false;
  if (!o.includeMassDriver && isMassDriver(l)) return false;
  const d = l.tof_days_min ?? l.tof_days_max;
  if (!o.allowSlow && d !== null && d > o.slowDays) return false;
  return true;
}

/** Impulsive transfers are roughly time-reversible, so a published A->B leg also suggests B->A at
 * the same cost. Only added where no B->A leg is published; never for aerocapture, mass drivers or
 * launch from Earth's surface (those are one-way by nature). Reversed legs are flagged. */
export function withReverses(legs: Leg[], o: Options): Leg[] {
  if (!o.allowReverse) return legs;
  const has = new Set(legs.map(l => `${l.from}>${l.to}`));
  const out = [...legs];
  for (const l of legs) {
    if (has.has(`${l.to}>${l.from}`) || isAerocapture(l) || isMassDriver(l) || l.from === "earth" || l.to === "earth") continue;
    out.push({ ...l, from: l.to, to: l.from, reversed: true, label: "Inference: reversed " + l.label });
  }
  return out;
}

/** All simple routes from -> to with at most maxLegs legs. Parallel legs (same endpoints,
 * different methods) are separate options. */
export function routes(t: Transfers, from: string, to: string, o: Options): Route[] {
  const out: Route[] = [];
  const adj = new Map<string, Leg[]>();
  for (const l of withReverses(t.legs, o)) if (usable(l, o)) (adj.get(l.from) ?? adj.set(l.from, []).get(l.from)!).push(l);
  const path: Leg[] = [];
  const seen = new Set<string>([from]);
  const walk = (at: string) => {
    if (at === to) {
      let dv = 0, days = 0, unknown = false;
      for (const l of path) { dv += legDv(l, o); const d = legDays(l, o); if (d === null) unknown = true; else days += d; }
      out.push({ legs: [...path], dv, days, unknownTime: unknown });
      return;
    }
    if (path.length >= o.maxLegs) return;
    for (const l of adj.get(at) ?? []) {
      if (seen.has(l.to)) continue;
      seen.add(l.to); path.push(l);
      walk(l.to);
      path.pop(); seen.delete(l.to);
    }
  };
  walk(from);
  return out;
}

/** Pareto front on (delta-v, days): routes no other route beats on both. Sorted by delta-v. */
export function pareto(rs: Route[]): Route[] {
  // delta-v within 10 m/s counts as a tie (the sources aren't more precise than that)
  const q = (x: number) => Math.round(x * 100);
  const sorted = [...rs].sort((a, b) => q(a.dv) - q(b.dv) || a.days - b.days || a.legs.length - b.legs.length);
  const front: Route[] = [];
  let bestDays = Infinity;
  for (const r of sorted) {
    if (r.days < bestDays - 1e-9) { front.push(r); bestDays = r.days; }
  }
  return front;
}

/** Tsiolkovsky: propellant as a fraction of initial mass for a given delta-v (km/s) and Isp (s). */
export function propellantFraction(dvKms: number, ispS: number): number {
  return 1 - Math.exp(-(dvKms * 1000) / (ispS * 9.80665));
}
