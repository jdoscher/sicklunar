import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DEFAULT_OPTIONS, pareto, propellantFraction, routes, type Transfers } from "../src/planner.ts";
import { angleDeg, canSee, inShadow, segmentHitsSphere, sphereMagnitude, sunDir, type ObserverSpec, type Params } from "../src/coverage.ts";

const T: Transfers = JSON.parse(readFileSync(new URL("../../cislunar/research_data/transfers.json", import.meta.url), "utf8"));

test("planner: LEO -> LLO direct is about 4 km/s, Pareto front is monotone", () => {
  const rs = routes(T, "leo", "llo", DEFAULT_OPTIONS);
  assert.ok(rs.length > 3);
  const front = pareto(rs);
  assert.ok(front[0].dv >= 3.5 && front[0].dv <= 4.5, `cheapest ${front[0].dv}`);
  for (let i = 1; i < front.length; i++) {
    assert.ok(front[i].dv >= front[i - 1].dv);
    assert.ok(front[i].days < front[i - 1].days);
  }
});

test("planner: disabling slow legs removes multi-month routes", () => {
  const rs = routes(T, "leo", "nrho", { ...DEFAULT_OPTIONS, allowSlow: false });
  for (const r of rs) for (const l of r.legs) assert.ok((l.tof_days_min ?? 0) <= 30);
});

test("planner: every leg cites a URL and every endpoint is a known node", () => {
  const ids = new Set(T.nodes.map(n => n.id));
  for (const l of T.legs) {
    assert.ok(/^https?:\/\//.test(l.source_url), l.source_url);
    assert.ok(ids.has(l.from) && ids.has(l.to), `${l.from}->${l.to}`);
  }
});

test("rocket equation", () => {
  assert.ok(Math.abs(propellantFraction(3.2, 450) - 0.515) < 0.01);
});

test("magnitude: 1 m^2 albedo 0.2 sphere at GEO distance, zero phase ~ 15.7; lunar distance ~ 5 mag fainter", () => {
  const geo = sphereMagnitude(1, 0.2, 35786, 0);
  assert.ok(geo > 15 && geo < 16.5, String(geo));
  const lun = sphereMagnitude(1, 0.2, 384400, 0);
  assert.ok(Math.abs(lun - geo - 5 * Math.log10(384400 / 35786)) < 1e-9);
  assert.ok(sphereMagnitude(1, 0.2, 35786, 90) > geo);
});

test("geometry helpers", () => {
  assert.ok(segmentHitsSphere([-2, 0, 0], [2, 0, 0], [0, 0, 0], 0.5));
  assert.ok(!segmentHitsSphere([-2, 1, 0], [2, 1, 0], [0, 0, 0], 0.5));
  assert.ok(inShadow([-3, 0.1, 0], [0, 0, 0], 0.5, [1, 0, 0]));
  assert.ok(!inShadow([3, 0.1, 0], [0, 0, 0], 0.5, [1, 0, 0]));
  assert.ok(Math.abs(angleDeg([1, 0, 0], [0, 1, 0]) - 90) < 1e-9);
  const s0 = sunDir({ sun0Deg: 0 } as Params, 0), sHalf = sunDir({ sun0Deg: 0 } as Params, 29.530589 / 2);
  assert.ok(Math.abs(s0[0] - 1) < 1e-12 && Math.abs(sHalf[0] + 1) < 1e-9);
});

test("canSee: ground can't see a target next to the Sun, can see one opposite it if bright enough", () => {
  const p: Params = {
    mu: 0.01215, lunitKm: 389703, tunitDays: 4.4326, rEarth: 6378 / 389703, rMoon: 1737 / 389703,
    sunExclDeg: 30, moonExclDeg: 10, earthExclDeg: 15, groundSunDeg: 20, groundMoonDeg: 5,
    areaM2: 100, albedo: 0.2, days: 29.5, steps: 10, sun0Deg: 0,
  };
  const ground: ObserverSpec = { id: "g", kind: "ground", count: 1, limitingMag: 20 };
  const earth: [number, number, number] = [-p.mu, 0, 0];
  const s: [number, number, number] = [1, 0, 0];
  assert.equal(canSee(ground, earth, [0.2, 0.01, 0], s, p), false); // toward the Sun
  assert.equal(canSee(ground, earth, [-0.3, 0.2, 0], s, p), true);  // anti-sun side, 100 m^2, ~120,000 km
});

test("planner: reversed legs make LEO -> EM-L4 reachable and are flagged", () => {
  const rs = routes(T, "leo", "eml4", DEFAULT_OPTIONS);
  assert.ok(rs.length > 0);
  assert.ok(rs.every(r => r.legs.some(l => l.reversed)));
  assert.equal(routes(T, "leo", "eml4", { ...DEFAULT_OPTIONS, allowReverse: false }).length, 0);
});
