// Mission Planner data loading. Startup needs only small files; each flight path is fetched on Launch.
import type { LunarSite, Site, Transfer } from "./model";

export interface System { mu: number; lunit_km: number; tunit_s: number }
type Summary = Omit<Transfer, "times" | "points"> & { path: string };

const getJson = async <T>(u: string): Promise<T> => {
  const r = await fetch(u);
  if (!r.ok) throw new Error(`${u}: HTTP ${r.status}`);
  return r.json() as Promise<T>;
};

export interface PlanningData {
  system: System;
  /** Transfers without their paths (enough for planning, fuel and calendars). */
  transfers: Record<string, Transfer>;
  sites: Site[];
  lunar: LunarSite[];
}

export async function loadPlanningData(): Promise<PlanningData> {
  const [sys, summary, sites, lunar] = await Promise.all([
    getJson<Record<string, System>>("/data/system.json"),
    getJson<Record<string, Summary>>("/data/mission_summary.json"),
    getJson<{ sites: Site[] }>("/data/launch_sites.json"),
    getJson<{ sites: LunarSite[] }>("/data/lunar_sites.json").catch(() => ({ sites: [] as LunarSite[] })),
  ]);
  const transfers: Record<string, Transfer> = {};
  for (const [k, s] of Object.entries(summary)) transfers[k] = { ...(s as unknown as Transfer), times: [], points: [] };
  return { system: sys["earth-moon"], transfers, sites: sites.sites, lunar: lunar.sites };
}

const pathCache = new Map<string, Promise<Transfer>>();
/** Full transfer (summary + path) for a key; cached. */
export function loadFlight(key: string, transfers: Record<string, Transfer>): Promise<Transfer> {
  const s = transfers[key] as Transfer & { path?: string };
  const file = s.path ?? key;
  if (!pathCache.has(key)) {
    pathCache.set(key, getJson<{ times: number[]; points: [number, number, number][]; orbit?: { times: number[]; points: [number, number, number][] } }>(`/data/mission_paths/${file}.json`)
      .then(p => ({ ...s, times: p.times, points: p.points, ...(s.orbit && p.orbit ? { orbit: { ...s.orbit, times: p.orbit.times, points: p.orbit.points } } : {}) })));
  }
  return pathCache.get(key)!;
}
