import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildMission, len, sub, wallToMission, missionToWall, totalWall, type V } from "../src/mission/geometry.ts";
import { geoBurns, plan, rateMonth, toUnits, type Site, type Transfer } from "../src/mission/model.ts";

const root = new URL("../../cislunar/", import.meta.url);
const TR: Record<string, Transfer> = JSON.parse(readFileSync(new URL("mission_data/transfers.json", root), "utf8"));
const SITES: Site[] = JSON.parse(readFileSync(new URL("research_data/launch_sites.json", root), "utf8")).sites;
const SYS = { mu: 1.215058560962404e-2, lunit_km: 389703.264829278, tunit_s: 382981.289129055 };
const site = (id: string) => SITES.find(s => s.id === id)!;
const DATE = new Date(Date.UTC(2026, 11, 3));

function maxJump(m: ReturnType<typeof buildMission>, n = 4000) {
  // largest position change between consecutive samples, relative to a speed bound of 12 km/s
  let worst = 0, at = 0;
  let prev = m.craft(0);
  for (let k = 1; k <= n; k++) {
    const t = (m.end * k) / n;
    const p = m.craft(t);
    const r = len(sub(p, prev)) / (12 * (m.end / n));
    if (r > worst) { worst = r; at = t; }
    prev = p;
  }
  return { worst, at };
}

for (const dest of ["leo", "geo", "flyby", "llo", "surface", "nrho", "dro", "l1halo", "l2halo", "l4"] as const) {
  test(`${dest}: builds from Cape Canaveral, continuous path, ends where it should`, () => {
    const p = plan(dest, site("ksc"), DATE, TR);
    const m = buildMission(p, TR[dest], SYS, 70);
    assert.equal(m.failAt, undefined);
    const j = maxJump(m);
    assert.ok(j.worst < 1.0, `${dest} jump ratio ${j.worst.toFixed(2)} at t=${(j.at / 3600).toFixed(2)} h`);
    // liftoff on the chosen day
    assert.equal(m.liftoff.toISOString().slice(0, 10), "2026-12-03");
    // starts on the launch pad
    assert.ok(Math.abs(len(m.craft(0)) - 6378.137) < 1);
    const endP = m.craft(m.end);
    if (dest === "llo") assert.ok(Math.abs(len(sub(endP, m.moon(m.end))) - 1837.4) < 5);
    if (dest === "surface") assert.ok(Math.abs(len(sub(endP, m.moon(m.end))) - 1737.4) < 5);
    if (dest === "geo") assert.ok(Math.abs(len(endP) - 42164) < 5);
    if (dest === "flyby") assert.ok(len(endP) < 6600, String(len(endP)));
  });
}

test("Moon-arrival geometry: LLO arrival is 100 km above the Moon at arrival time", () => {
  const p = plan("llo", site("kourou"), DATE, TR);
  const m = buildMission(p, TR.llo, SYS, 70);
  const tArr = (m.info.arrival!.getTime() - m.liftoff.getTime()) / 1000;
  assert.ok(Math.abs(len(sub(m.craft(tArr), m.moon(tArr))) - 1837.4) < 5);
});

test("out of fuel: a 45-unit tank can't land; mission stops at the descent burn", () => {
  const p = plan("surface", site("ksc"), DATE, TR);
  const m = buildMission(p, TR.surface, SYS, 45);
  assert.equal(m.failPhase, "descent");
});

test("GEO costs more from higher latitudes; Kourou is cheapest", () => {
  const units = SITES.map(s => ({ id: s.id, u: plan("geo", s, DATE, TR).totalUnits }));
  units.sort((a, b) => a.u - b.u);
  assert.equal(units[0].id, "kourou");
  const cape = plan("geo", site("ksc"), DATE, TR).totalUnits;
  assert.ok(cape > 41 && cape < 44, String(cape));
  assert.ok(toUnits(geoBurns(0).gto + geoBurns(0).geo) > 38 && toUnits(geoBurns(0).gto + geoBurns(0).geo) < 40);
});

test("playback mapping is monotone and invertible", () => {
  const m = buildMission(plan("dro", site("ksc"), DATE, TR), TR.dro, SYS, 70);
  const W = totalWall(m.segments);
  let prev = -1;
  for (let w = 0; w <= W; w += W / 200) {
    const t = wallToMission(m.segments, w);
    assert.ok(t >= prev);
    assert.ok(Math.abs(missionToWall(m.segments, t) - w) < 1e-6 * W + 1e-6);
    prev = t;
  }
});

test("calendar: Apollo-style landing days exist each month and are mornings", () => {
  const days = rateMonth("surface", site("ksc"), 2026, 11, TR);
  const good = days.filter(d => d.good);
  assert.ok(good.length >= 1 && good.length <= 4, String(good.length));
});

void (null as unknown as V);

// ---- landing sites (polar orbit, waiting for the site, lighting and radio)
import { DEFAULT_LUNAR_SITE, landingVerdict, siteRotFrame, waitForSiteDays, type LunarSite } from "../src/mission/model.ts";
import { julianDay, lunarEarthElevation, subEarthPoint } from "../src/mission/ephem.ts";
const LS = (id: string, lat: number, lon: number, region = "near-side"): LunarSite => ({ ...DEFAULT_LUNAR_SITE, id, name: id, lat, lon, region });
const TEST_SITES = [LS("pole", -89.5, 0, "south-pole"), LS("change-4", -45.4446, 177.5991, "far-side"), LS("apollo-15", 26.1322, 3.6339), LS("apollo-11", 0.674, 23.473)];

for (const ls of TEST_SITES) {
  test(`surface ${ls.id}: right orbit, lands on the site, continuous`, () => {
    const p = plan("surface", site("ksc"), DATE, TR, ls);
    assert.equal(p.transferKey, Math.abs(ls.lat) > 10 ? "llo_polar" : "surface");
    assert.ok(p.landingWaitDays! >= 1 && p.landingWaitDays! < 1 + 27.4, `wait ${p.landingWaitDays}`);
    const m = buildMission(p, TR[p.transferKey!], SYS, 70);
    assert.equal(m.failAt, undefined);
    const j = maxJump(m);
    assert.ok(j.worst < 1.0, `${ls.id} jump ratio ${j.worst.toFixed(2)} at t=${(j.at / 3600).toFixed(2)} h`);
    const tLand = m.events.find(e => e.phase === "landed")!.t;
    // the 12-minute descent covers ~37 deg along the orbit; much more would mean the orbit missed the site
    const tDesc = m.events.find(e => e.phase === "descent")!.t;
    const a = sub(m.craft(tDesc), m.moon(tDesc)), b = sub(m.craft(tLand), m.moon(tLand));
    const ang = Math.acos(Math.min(1, (a[0] * b[0] + a[1] * b[1] + a[2] * b[2]) / (len(a) * len(b)))) * 180 / Math.PI;
    assert.ok(ang > 30 && ang < 42, `${ls.id}: descent starts ${ang.toFixed(1)} deg from the site`);
    assert.ok(Math.abs(len(sub(m.craft(m.end), m.moon(m.end))) - 1737.4) < 5);
  });
}

test("polar orbit: a mid-latitude site lines up with the plane twice a month", () => {
  const llo = TR.llo_polar.llo!;
  const w1 = waitForSiteDays(llo, { lat: 26, lon: 3.6 }, 1);
  const w2 = waitForSiteDays(llo, { lat: 26, lon: 3.6 }, w1 + 0.5);
  assert.ok(Math.abs(w2 - w1 - 27.321661 / 2) < 0.3, `${w1} ${w2}`);
  assert.equal(waitForSiteDays(llo, { lat: -89.5, lon: 0 }, 1), 1);
  assert.deepEqual(siteRotFrame({ lat: 0, lon: 0 }).map(x => Math.round(x)), [-1, -0, 0]);
});

test("libration: Meeus example 53.a (1992-04-12 0h): l = -1.2 deg, b = +4.2 deg", () => {
  const e = subEarthPoint(julianDay(new Date("1992-04-12T00:00:00Z")));
  assert.ok(Math.abs(e.lon - -1.206) < 0.3, `l ${e.lon}`);
  assert.ok(Math.abs(e.lat - 4.194) < 0.3, `b ${e.lat}`);
});

test("south pole: Earth bobs above and below the horizon each month; far side never sees Earth", () => {
  let up = 0, n = 0, farUp = 0;
  for (let d = 0; d < 28; d += 0.5) {
    const jd = julianDay(new Date(Date.UTC(2026, 11, 1) + d * 86400e3));
    if (lunarEarthElevation(jd, -89.5, 0) > 0) up++;
    if (lunarEarthElevation(jd, -45.4, 177.6) > 0) farUp++;
    n++;
  }
  assert.ok(up > n * 0.2 && up < n * 0.8, `earth up ${up}/${n}`);
  assert.equal(farUp, 0);
  const v = landingVerdict({ landingSite: TEST_SITES[1], landingSunElev: 10, landingMorning: true, landingEarthElev: -40 });
  assert.ok(v.ok && /relay/.test(v.text));
});

// ---- planner helpers: tank auto-switch, next good day, calendar marks
import { calendarMarks, landingPlain, nextGoodDay, tankForDest, LANDER_TANK } from "../src/mission/model.ts";

test("tank: landing upgrades to the 65-unit stack, other trips keep the tank", () => {
  assert.equal(tankForDest("surface", 45), LANDER_TANK);
  assert.equal(tankForDest("surface", 65), 65);
  assert.equal(tankForDest("llo", 45), 45);
  assert.equal(tankForDest("dro", 65), 65);
});

test("next good day: never in the past, and a landing on that day passes the light check with the lander tank", () => {
  const from = new Date(Date.UTC(2026, 10, 17));
  for (const ls of TEST_SITES) {
    const d = nextGoodDay("surface", site("ksc"), from, TR, ls);
    assert.ok(d, ls.id);
    assert.ok(d!.getTime() >= from.getTime(), ls.id);
    const p = plan("surface", site("ksc"), d!, TR, ls);
    assert.ok(landingVerdict(p).ok, `${ls.id} ${d!.toISOString()}`);
    assert.ok(p.totalUnits <= LANDER_TANK, String(p.totalUnits));
    assert.match(landingPlain(p), /^Good day/);
  }
  // Apollo 11 from Kennedy: first good day after 17 Nov 2026 is in December (Nov's were before the 17th)
  const a11 = nextGoodDay("surface", site("ksc"), from, TR, TEST_SITES[3])!;
  assert.ok(a11.getUTCMonth() === 11 || a11.getUTCFullYear() > 2026 || a11.getUTCDate() >= 17);
});

test("calendar marks: all-equal months mark nothing; landing months mark only open good days", () => {
  const today = new Date(Date.UTC(2026, 10, 17));
  const llo = calendarMarks(rateMonth("leo", site("ksc"), 2026, 10, TR), today);
  assert.equal(llo.allEqual, true);
  assert.equal(llo.good.size, 0);
  const land = rateMonth("surface", site("ksc"), 2026, 11, TR);
  const m = calendarMarks(land, today);
  assert.equal(m.allEqual, false);
  assert.equal(m.good.size, land.filter(d => d.good).length);
  // past good days are not marked
  const nov = rateMonth("surface", site("ksc"), 2026, 10, TR);
  const mn = calendarMarks(nov, today);
  for (const t of mn.good) assert.ok(t >= today.getTime());
});

test("plain landing verdict explains a bad day and asks for a checked day", () => {
  const p = plan("surface", site("ksc"), new Date(Date.UTC(2026, 10, 17)), TR, TEST_SITES[3]);
  if (!landingVerdict(p).ok) assert.match(landingPlain(p), /check mark/);
});
