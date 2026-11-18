import { test } from "node:test";
import assert from "node:assert/strict";
import {
  APOLLO11, eclipticToEquatorial, elongationDeg, gmstDeg, julianDay, lunarSunElevation, moonEcliptic, phaseName, sunLongitude,
} from "../src/mission/ephem.ts";

test("Meeus example 47.a: Moon on 1992 April 12 0h TT", () => {
  const jd = 2448724.5;
  const m = moonEcliptic(jd);
  assert.ok(Math.abs(m.lon - 133.162655) < 0.3, String(m.lon));
  assert.ok(Math.abs(m.lat - -3.229126) < 0.2, String(m.lat));
  assert.ok(Math.abs(m.distKm - 368409.7) < 1500, String(m.distKm));
});

test("Meeus example 25.a: Sun on 1992 October 13 0h TD", () => {
  assert.ok(Math.abs(sunLongitude(2448908.5) - 199.90988) < 0.02);
});

test("Meeus example 12.a: GMST on 1987 April 10 0h UT = 13h10m46.3668s", () => {
  const expected = (13 + 10 / 60 + 46.3668 / 3600) * 15;
  assert.ok(Math.abs(gmstDeg(2446895.5) - expected) < 0.01);
});

test("known full and new moons", () => {
  // Full Moon 2024-04-23 23:49 UTC; New Moon 2024-04-08 18:21 UTC (total solar eclipse)
  assert.ok(Math.abs(elongationDeg(julianDay(new Date("2024-04-23T23:49:00Z"))) - 180) < 2);
  const e = elongationDeg(julianDay(new Date("2024-04-08T18:21:00Z")));
  assert.ok(e < 2 || e > 358, String(e));
  assert.equal(phaseName(julianDay(new Date("2024-04-23T23:49:00Z"))), "Full Moon");
});

test("Apollo 11 landing: low morning Sun at Tranquility Base (~10 deg)", () => {
  const s = lunarSunElevation(julianDay(new Date("1969-07-20T20:17:40Z")), APOLLO11.lat, APOLLO11.lon);
  assert.ok(s.morning);
  assert.ok(s.elev > 9 && s.elev < 12.5, String(s.elev)); // NASA: about 10.8 deg
});

test("Moon declination stays within about +/-29 deg", () => {
  let max = 0;
  for (let d = 0; d < 365; d += 0.5) {
    const jd = 2461041.5 + d; // 2026
    const m = moonEcliptic(jd);
    max = Math.max(max, Math.abs(eclipticToEquatorial(m.lon, m.lat, jd).dec));
  }
  assert.ok(max > 25 && max < 29.5, String(max));
});
