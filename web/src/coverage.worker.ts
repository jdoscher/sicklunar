import { computeCoverage, makeGrid, type ObserverSpec, type Params, type TrackSpec } from "./coverage.ts";

export interface CoverageJob {
  observers: ObserverSpec[];
  tracks: TrackSpec[];
  params: Params;
  grid: { nx: number; ny: number; nz: number; xr: [number, number]; yr: [number, number]; zr: [number, number] };
}

self.onmessage = (e: MessageEvent<CoverageJob>) => {
  const { observers, tracks, params, grid } = e.data;
  const g = makeGrid(grid.nx, grid.ny, grid.nz, grid.xr, grid.yr, grid.zr);
  const t0 = performance.now();
  const r = computeCoverage(g, observers, tracks, params);
  const flat = new Float32Array(g.points.length * 3);
  g.points.forEach((p, i) => flat.set(p, i * 3));
  (self as unknown as Worker).postMessage(
    { ...r, positions: flat, ms: performance.now() - t0 },
    [r.coverage.buffer, flat.buffer],
  );
};
