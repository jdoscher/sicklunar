import { test } from "node:test";
import assert from "node:assert/strict";
import { clearArea, distToContain, fillShare, fitPoints, focalPx, project, screenBox, viewOffset, type P3, type Rect } from "../src/fit.ts";

const ring = (r: number, n = 64, tilt = 0): P3[] =>
  Array.from({ length: n }, (_, k) => { const a = (2 * Math.PI * k) / n; return [r * Math.cos(a), r * Math.sin(a) * Math.cos(tilt), r * Math.sin(a) * Math.sin(tilt)] as P3; });

test("clear area: between the lowest top overlay and the highest bottom overlay", () => {
  assert.deepEqual(clearArea(390, 500, [40, 52], [450, 430]), { left: 0, top: 52, right: 390, bottom: 430 });
  // no overlays -> the whole stage
  assert.deepEqual(clearArea(390, 500, [], []), { left: 0, top: 0, right: 390, bottom: 500 });
  // overlays that leave less than minH keep minH, inside the stage
  const r = clearArea(390, 200, [150], [120], 80);
  assert.equal(r.bottom - r.top, 80);
  assert.ok(r.top >= 0 && r.bottom <= 200);
  // non-finite edges (hidden elements) are ignored
  assert.deepEqual(clearArea(100, 100, [NaN], [Infinity]), { left: 0, top: 0, right: 100, bottom: 100 });
});

test("view offset moves the view centre to the clear area's centre", () => {
  assert.deepEqual(viewOffset(400, 600, { left: 0, top: 100, right: 400, bottom: 500 }), { x: 0, y: 0 });
  // clear area lower than the stage centre -> negative y (content moves down)
  assert.deepEqual(viewOffset(400, 600, { left: 0, top: 200, right: 400, bottom: 600 }), { x: 0, y: -100 });
});

test("project: centre maps to the view centre, depth scales", () => {
  const F = focalPx(40, 500);
  assert.deepEqual(project([0, 0, 0], 10, [0, 0], F, 200, 300), [200, 300]);
  const a = project([1, 1, 0], 10, [0, 0], F, 0, 0)!, b = project([1, 1, 0], 20, [0, 0], F, 0, 0)!;
  assert.ok(Math.abs(a[0] - 2 * b[0]) < 1e-9 && a[1] < 0); // up is -y on screen
  assert.equal(project([0, 0, 11], 10, [0, 0], F, 0, 0), null); // behind the camera
});

for (const [name, clear] of [["portrait clear band", { left: 0, top: 40, right: 360, bottom: 330 }], ["landscape", { left: 0, top: 60, right: 520, bottom: 300 }]] as [string, Rect][]) {
  test(`fitPoints keeps a tilted orbit inside the ${name} and fills it`, () => {
    const F = focalPx(40, 400);
    for (const tilt of [0, 0.6, 1.2]) {
      const pts = ring(50, 128, tilt).map(p => [p[0] + 20, p[1] - 7, p[2]] as P3);
      const fit = fitPoints(pts, F, clear, 12);
      const b = fit.box;
      assert.ok(b.left >= clear.left + 11.9 && b.right <= clear.right - 11.9, `x ${b.left}..${b.right}`);
      assert.ok(b.top >= clear.top + 11.9 && b.bottom <= clear.bottom - 11.9, `y ${b.top}..${b.bottom}`);
      const s = fillShare(b, clear);
      assert.ok(Math.max(s.w, s.h) > 0.85, `fill ${s.w} ${s.h}`);
      // centred on the clear area
      const cx = (clear.left + clear.right) / 2, cy = (clear.top + clear.bottom) / 2;
      assert.ok(Math.abs((b.left + b.right) / 2 - cx) < 3 && Math.abs((b.top + b.bottom) / 2 - cy) < 3);
      // box agrees with an independent projection
      assert.deepEqual(screenBox(pts, fit.dist, fit.pan, F, cx, cy), b);
    }
  });
}

test("fitPoints: a point near the camera side (perspective) still fits", () => {
  const F = focalPx(40, 600);
  const pts: P3[] = [[-10, -10, 0], [10, 10, 0], [0, 0, 30], [5, -5, -40]];
  const clear = { left: 0, top: 50, right: 400, bottom: 550 };
  const fit = fitPoints(pts, F, clear, 10);
  assert.ok(fit.dist > 30);
  assert.ok(fit.box.top >= 59.9 && fit.box.bottom <= 540.1 && fit.box.left >= 9.9 && fit.box.right <= 390.1);
});

test("distToContain: zooms out only as far as needed", () => {
  const F = focalPx(40, 500);
  const clear = { left: 0, top: 100, right: 300, bottom: 400 };
  // a point at the centre never needs zooming out
  assert.equal(distToContain([[0, 0, 0]], F, clear, 10, 5), 5);
  const pts: P3[] = [[40, 0, 0], [0, -30, 0]];
  const d = distToContain(pts, F, clear, 10, 5);
  const b = screenBox(pts, d, [0, 0], F, 150, 250)!;
  assert.ok(b.right <= 290.01 && b.bottom <= 390.01);
  assert.ok(b.right > 285 || b.bottom > 385, "tight, not over-zoomed");
  // already far enough -> unchanged
  assert.equal(distToContain(pts, F, clear, 10, d * 3), d * 3);
});

test("fitPoints: uneven padding (room for labels on the right) shifts the frame left", () => {
  const F = focalPx(40, 400);
  const clear = { left: 0, top: 0, right: 400, bottom: 400 };
  const pts = ring(50, 128, 0);
  const fit = fitPoints(pts, F, clear, { left: 10, top: 10, right: 60, bottom: 10 });
  assert.ok(fit.box.right <= 340.01 && fit.box.left >= 9.99, `${fit.box.left}..${fit.box.right}`);
  assert.ok(Math.abs((fit.box.left + fit.box.right) / 2 - 175) < 2);
  // the view centre stays at the clear area's centre: the look point is panned, not the view
  assert.ok(fit.pan[0] > 0);
});
