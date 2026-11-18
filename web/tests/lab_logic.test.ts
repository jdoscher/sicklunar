import { test } from "node:test";
import assert from "node:assert/strict";
import { cappedPixelRatio, heatAlpha, heatColor, hexToRgb, luminance, nextTabIndex, parseMode } from "../src/lab_logic.ts";

test("heat ramp: ends match the design stops", () => {
  assert.deepEqual(heatColor(0).map(c => Math.round(c * 255)), [0x1e, 0x4e, 0x6e]);
  assert.deepEqual(heatColor(1).map(c => Math.round(c * 255)), [0xf3, 0xf5, 0xf8]);
  assert.deepEqual(heatColor(2 / 3).map(c => Math.round(c * 255)), [0x7a, 0xd4, 0xff]);
  assert.deepEqual(heatColor(-1), heatColor(0));
  assert.deepEqual(heatColor(5), heatColor(1));
  assert.deepEqual(heatColor(NaN), heatColor(0));
});

test("heat ramp: luminance strictly increases (reads in greyscale / colour-blind safe)", () => {
  let prev = -1;
  for (let i = 0; i <= 100; i++) {
    const L = luminance(heatColor(i / 100));
    assert.ok(L > prev, `luminance not increasing at ${i}%`);
    prev = L;
  }
  assert.ok(heatAlpha(0) < heatAlpha(0.5) && heatAlpha(0.5) < heatAlpha(1));
  assert.equal(heatAlpha(1), 1);
});

test("hexToRgb", () => {
  assert.deepEqual(hexToRgb("#ff0000"), [1, 0, 0]);
});

test("tab keys: arrows wrap, Home/End jump, others ignored", () => {
  assert.equal(nextTabIndex("ArrowRight", 2, 3), 0);
  assert.equal(nextTabIndex("ArrowLeft", 0, 3), 2);
  assert.equal(nextTabIndex("ArrowDown", 0, 3), 1);
  assert.equal(nextTabIndex("Home", 2, 3), 0);
  assert.equal(nextTabIndex("End", 0, 3), 2);
  assert.equal(nextTabIndex("Enter", 0, 3), null);
  assert.equal(nextTabIndex("ArrowRight", 0, 0), null);
});

test("pixel ratio capped at 1.5 on touch, 2 elsewhere", () => {
  assert.equal(cappedPixelRatio(3, true), 1.5);
  assert.equal(cappedPixelRatio(3, false), 2);
  assert.equal(cappedPixelRatio(1, true), 1);
  assert.equal(cappedPixelRatio(NaN, true), 1);
});

test("mode deep links", () => {
  assert.equal(parseMode("planner"), "planner");
  assert.equal(parseMode("coverage"), "coverage");
  assert.equal(parseMode("bogus"), "viewer");
  assert.equal(parseMode(null), "viewer");
});
