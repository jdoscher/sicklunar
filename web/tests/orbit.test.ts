import { test } from "node:test";
import assert from "node:assert/strict";
import { sampleAt, toFrame, bodyAt, niceKm, stabilityLabel, trail, type Vec3 } from "../src/orbit.ts";

const circle: Vec3[] = Array.from({ length: 101 }, (_, i) => {
  const a = (2 * Math.PI * i) / 100;
  return [Math.cos(a), Math.sin(a), 0] as Vec3;
});

test("sampleAt hits samples and wraps", () => {
  assert.deepEqual(sampleAt(circle, 1, 0), circle[0]);
  const p = sampleAt(circle, 1, 1.25);
  assert.ok(Math.abs(p[0] - 0) < 1e-3 && Math.abs(p[1] - 1) < 1e-3);
  const q = sampleAt(circle, 1, -0.25);
  assert.ok(Math.abs(q[1] + 1) < 1e-3);
});

test("rotating frame is identity; inertial frames rotate about the chosen body", () => {
  const mu = 0.0121505856;
  assert.deepEqual(toFrame([0.5, 0.1, 0.2], 1.0, "rotating", mu), [0.5, 0.1, 0.2]);
  const m = bodyAt("moon", Math.PI / 2, "inertial-earth", mu);
  assert.ok(Math.abs(m[0]) < 1e-12 && Math.abs(m[1] - 1) < 1e-12);
  const moonSelf = bodyAt("moon", 2.0, "inertial-moon", mu);
  assert.ok(Math.hypot(...moonSelf) < 1e-12);
  const e = bodyAt("earth", 0, "inertial-moon", mu);
  assert.ok(Math.abs(e[0] + 1) < 1e-12);
});

test("trail returns steps+1 points", () => {
  assert.equal(trail(circle, 1, 0, 2, 50, "inertial-earth", 0.01).length, 51);
});

test("helpers", () => {
  assert.equal(niceKm(60000), 20000);
  assert.equal(stabilityLabel(1.0), "stable");
  assert.equal(stabilityLabel(555), "strongly unstable");
});

test("sampleAt with explicit times interpolates by time, not index", () => {
  const pts: Vec3[] = [[0, 0, 0], [1, 0, 0], [2, 0, 0], [0, 0, 0]];
  const times = [0, 0.1, 0.9, 1.0];
  const p = sampleAt(pts, 1, 0.5, times);
  assert.ok(Math.abs(p[0] - 1.5) < 1e-12);
  const q = sampleAt(pts, 1, 0.05, times);
  assert.ok(Math.abs(q[0] - 0.5) < 1e-12);
});
