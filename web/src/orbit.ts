// Pure orbit math for the web app (no three.js here, so node tests can import it).

export type Vec3 = [number, number, number];

export interface SystemInfo {
  name: string;
  mu: number;
  lunit_km: number;
  tunit_s: number;
  r_primary_km: number;
  r_secondary_km: number;
  lagrange: Record<string, Vec3>;
}

export interface OrbitMember {
  index: number;
  period: number; // nondimensional
  period_days: number;
  jacobi: number;
  stability_index: number;
  primary_min_km: number;
  primary_max_km: number;
  secondary_min_km: number;
  secondary_max_km: number;
  z_extent_km: number;
  points: Vec3[]; // rotating frame, nondim, spaced by arc length over one period (first == last)
  times: number[]; // nondim time of each point, 0..period
}

export type Frame = "rotating" | "inertial-earth" | "inertial-moon";

/** Position on a periodic orbit at time t (nondim): wrap into one period, binary-search the
 * sample times, interpolate linearly. Without `times`, samples are assumed uniform in time. */
export function sampleAt(points: Vec3[], period: number, t: number, times?: number[]): Vec3 {
  const n = points.length - 1; // last sample repeats the first
  const u = ((t % period) + period) % period;
  let i: number, a: number;
  if (times) {
    let lo = 0, hi = n;
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (times[mid] <= u) lo = mid; else hi = mid; }
    i = lo;
    const span = times[i + 1] - times[i];
    a = span > 0 ? (u - times[i]) / span : 0;
  } else {
    const f = (u / period) * n;
    i = Math.min(Math.floor(f), n - 1);
    a = f - i;
  }
  const p = points[i], q = points[i + 1];
  return [p[0] + (q[0] - p[0]) * a, p[1] + (q[1] - p[1]) * a, p[2] + (q[2] - p[2]) * a];
}

/** Rotating-frame point at time t -> chosen frame, origin moved to the frame center. */
export function toFrame(p: Vec3, t: number, frame: Frame, mu: number): Vec3 {
  if (frame === "rotating") return p;
  const cx = frame === "inertial-earth" ? -mu : 1 - mu;
  const x = p[0] - cx, y = p[1];
  const c = Math.cos(t), s = Math.sin(t);
  if (frame === "inertial-earth") return [c * x - s * y, s * x + c * y, p[2]];
  // Moon-centered, non-rotating: rotate about the Moon, which itself moves; subtract its motion.
  return [c * x - s * y, s * x + c * y, p[2]];
}

/** Body position (Earth or Moon) in a frame at time t. */
export function bodyAt(body: "earth" | "moon", t: number, frame: Frame, mu: number): Vec3 {
  const p: Vec3 = body === "earth" ? [-mu, 0, 0] : [1 - mu, 0, 0];
  return toFrame(p, t, frame, mu);
}

/** Trail of the orbit in a frame over [t0, t1], with `steps` samples. */
export function trail(points: Vec3[], period: number, t0: number, t1: number, steps: number, frame: Frame, mu: number, times?: number[]): Vec3[] {
  const out: Vec3[] = [];
  for (let k = 0; k <= steps; k++) {
    const t = t0 + ((t1 - t0) * k) / steps;
    out.push(toFrame(sampleAt(points, period, t, times), t, frame, mu));
  }
  return out;
}

/** Stability index -> short human label. JPL: 1 = linearly stable. */
export function stabilityLabel(nu: number): string {
  if (nu <= 1.001) return "stable";
  if (nu < 10) return "nearly stable";
  if (nu < 100) return "unstable";
  return "strongly unstable";
}

export function fmtKm(km: number): string {
  if (km >= 1e6) return `${(km / 1e6).toFixed(2)} million km`;
  return `${Math.round(km).toLocaleString("en-US")} km`;
}

export function fmtDays(d: number): string {
  return d < 2 ? `${(d * 24).toFixed(1)} h` : `${d.toFixed(2)} days`;
}

/** Nice scale-bar length (km) for a visible span (km). */
export function niceKm(spanKm: number): number {
  const steps = [100, 200, 500, 1000, 2000, 5000, 10000, 20000, 50000, 100000, 200000, 500000, 1e6, 2e6];
  for (const s of steps) if (s > spanKm / 6) return s;
  return steps[steps.length - 1];
}
