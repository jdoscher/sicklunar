import * as THREE from "three";
import { $, esc, type Ctx, type KeyOrbitData } from "./ctx";
import { heatAlpha, heatColor } from "./lab_logic";
import type { ObserverSpec, Params, TrackSpec } from "./coverage";
import type { Vec3 } from "./orbit";

interface SdaData {
  photometry: { albedo_default: number; source_url: string };
  exclusion: { sun_deg: number; moon_deg: number; earth_limb_deg: number; source_url: string };
  placement_findings: { finding: string; source_url: string }[];
}

interface SensorDef { id: string; name: string; kind: ObserverSpec["kind"]; slug?: string; mirrorY?: boolean; maxCount: number }

const SENSORS: SensorDef[] = [
  { id: "ground", name: "Ground telescope network (global)", kind: "ground", maxCount: 1 },
  { id: "geo", name: "GEO satellites", kind: "geo", maxCount: 4 },
  { id: "l1", name: "L1 halo", kind: "orbit", slug: "07-l1-halo", maxCount: 12 },
  { id: "l2", name: "L2 halo", kind: "orbit", slug: "08-l2-halo", maxCount: 12 },
  { id: "dro", name: "Distant retrograde orbit", kind: "orbit", slug: "14-dro", maxCount: 6 },
  { id: "res", name: "2:1 resonant (TESS-type)", kind: "orbit", slug: "19-resonant-2-1", maxCount: 4 },
  { id: "l4", name: "L4 short-period", kind: "orbit", slug: "17-l4-short-period", maxCount: 3 },
  { id: "l5", name: "L5 short-period", kind: "orbit", slug: "17-l4-short-period", mirrorY: true, maxCount: 3 },
  { id: "nrho", name: "NRHO (9:2)", kind: "orbit", slug: "09-nrho-9-2", maxCount: 4 },
];

const PRESETS: Record<string, { label: string; set: Record<string, number> }> = {
  today: { label: "Ground only (today)", set: { ground: 1 } },
  oracle: { label: "Ground + 1 at L1 (Oracle-like)", set: { ground: 1, l1: 1 } },
  gorman: { label: "L1 + L2 + DRO (3 sats)", set: { l1: 1, l2: 1, dro: 1 } },
  mixed: { label: "Mixed 8-sat architecture", set: { ground: 1, geo: 2, l1: 1, l2: 1, dro: 2, res: 2 } },
};

const TRACK_SLUGS = ["07-l1-halo", "08-l2-halo", "09-nrho-9-2", "12-butterfly", "14-dro", "15-dpo", "17-l4-short-period", "19-resonant-2-1"];

export function initCoverage(ctx: Ctx, sda: SdaData) {
  const group = new THREE.Group();
  group.visible = false;
  ctx.world.add(group);
  const sensorGroup = new THREE.Group(), heat = new THREE.Group();
  group.add(sensorGroup, heat);
  const ko = (slug: string) => ctx.keyOrbits.find(k => k.slug === slug) as KeyOrbitData;
  const counts: Record<string, number> = { ground: 1, l1: 1 };
  let worker: Worker | null = null;
  let lastPositions: Float32Array | null = null, lastCoverage: Float32Array | null = null;

  // defaults from the research (Bhadauria et al. AMOS 2024 for space keep-outs; Dao AMOS 2020 for ground)
  $<HTMLInputElement>("cv-sun").value = String(sda.exclusion.sun_deg);
  $<HTMLInputElement>("cv-moon").value = String(sda.exclusion.moon_deg);
  $<HTMLInputElement>("cv-earth").value = String(sda.exclusion.earth_limb_deg);

  // sensor list
  const list = $("cv-sensors");
  for (const s of SENSORS) {
    const row = document.createElement("div");
    row.className = "sensor";
    const opts = Array.from({ length: s.maxCount + 1 }, (_, i) => `<option value="${i}">${i === 0 ? "off" : s.kind === "ground" ? "on" : "× " + i}</option>`).join("");
    row.innerHTML = `<label for="cv-s-${s.id}">${esc(s.name)}</label><span class="select-wrap"><select id="cv-s-${s.id}" data-id="${s.id}">${opts}</select></span>`;
    list.appendChild(row);
  }
  const syncSelects = () => { for (const sel of list.querySelectorAll("select")) (sel as HTMLSelectElement).value = String(counts[(sel as HTMLSelectElement).dataset.id!] ?? 0); };
  list.addEventListener("change", e => {
    const sel = e.target as HTMLSelectElement;
    counts[sel.dataset.id!] = Number(sel.value);
    for (const o of presetBox.querySelectorAll("button")) o.setAttribute("aria-pressed", "false");
    drawSensors();
  });
  const presetBox = $("cv-presets");
  for (const [k, p] of Object.entries(PRESETS)) {
    const b = document.createElement("button");
    b.textContent = p.label;
    b.setAttribute("aria-pressed", "false");
    b.onclick = () => {
      for (const s of SENSORS) counts[s.id] = p.set[s.id] ?? 0;
      for (const o of presetBox.querySelectorAll("button")) o.setAttribute("aria-pressed", String(o === b));
      syncSelects(); drawSensors(); run();
    };
    b.dataset.preset = k;
    presetBox.appendChild(b);
  }
  syncSelects();

  const area = $<HTMLInputElement>("cv-area");
  const areaM2 = () => Math.pow(10, Number(area.value)); // slider is log10(m^2)
  const showArea = () => { $("cv-area-label").textContent = `${areaM2() < 1 ? areaM2().toFixed(2) : areaM2().toFixed(areaM2() < 10 ? 1 : 0)} m²`; };
  area.oninput = showArea; showArea();
  for (const id of ["cv-maglim-space", "cv-maglim-ground"]) {
    const s = $<HTMLInputElement>(id);
    const lab = $(id + "-label");
    const upd = () => { lab.textContent = `mag ${s.value}`; };
    s.oninput = upd; upd();
  }

  function drawSensors() {
    ctx.clearGroup(sensorGroup);
    for (const s of SENSORS) {
      const n = counts[s.id] ?? 0;
      if (!n || s.kind === "ground") continue;
      let pts: Vec3[];
      if (s.kind === "geo") {
        pts = Array.from({ length: 129 }, (_, k) => { const a = (2 * Math.PI * k) / 128, r = 42164 / ctx.em.lunit_km; return [-ctx.em.mu + r * Math.cos(a), r * Math.sin(a), 0] as Vec3; });
      } else {
        pts = ko(s.slug!).points.map(p => (s.mirrorY ? [p[0], -p[1], p[2]] : p) as Vec3);
      }
      const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts.map(ctx.v3)), new THREE.LineBasicMaterial({ color: 0xf3f5f8, transparent: true, opacity: 0.75 }));
      const tip = new THREE.Object3D();
      tip.position.copy(ctx.v3(pts[0]));
      const lab = ctx.label(`${s.name}${n > 1 ? " × " + n : ""}`, "craft");
      lab.element.style.marginTop = "18px"; // sit below the orbit's start point, clear of body labels
      tip.add(lab);
      sensorGroup.add(line, tip);
    }
    ctx.invalidate();
  }

  function render(positions: Float32Array, coverage: Float32Array) {
    ctx.clearGroup(heat);
    const planeOnly = $<HTMLInputElement>("cv-plane").checked;
    const minShow = 0.02;
    const keep: number[] = [];
    for (let i = 0; i < coverage.length; i++) {
      if (coverage[i] < minShow) continue;
      if (planeOnly && Math.abs(positions[i * 3 + 2]) > 0.03) continue;
      keep.push(i);
    }
    const pos = new Float32Array(keep.length * 3), col = new Float32Array(keep.length * 4);
    keep.forEach((i, j) => {
      const p = ctx.v3([positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2]]);
      pos.set([p.x, p.y, p.z], j * 3);
      const [r, g, b] = heatColor(coverage[i]);
      col.set([r, g, b, heatAlpha(coverage[i])], j * 4);
    });
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    geo.setAttribute("color", new THREE.BufferAttribute(col, 4));
    heat.add(new THREE.Points(geo, new THREE.PointsMaterial({ size: planeOnly ? 9 : 6, sizeAttenuation: false, vertexColors: true, transparent: true, depthWrite: false })));
    ctx.invalidate();
  }
  $("cv-plane").addEventListener("change", () => { if (lastPositions && lastCoverage) render(lastPositions, lastCoverage); });

  function run() {
    const observers: ObserverSpec[] = [];
    const magSpace = Number($<HTMLInputElement>("cv-maglim-space").value), magGround = Number($<HTMLInputElement>("cv-maglim-ground").value);
    for (const s of SENSORS) {
      const n = counts[s.id] ?? 0;
      if (!n) continue;
      if (s.kind === "orbit") {
        const k = ko(s.slug!);
        observers.push({ id: s.id, kind: "orbit", count: n, limitingMag: magSpace, points: k.points, times: k.times, period: k.period, mirrorY: s.mirrorY });
      } else observers.push({ id: s.id, kind: s.kind, count: n, limitingMag: s.kind === "ground" ? magGround : magSpace });
    }
    if (!observers.length) { $("cv-stats").innerHTML = `<p class="muted">Turn on at least one sensor.</p>`; ctx.clearGroup(heat); ctx.invalidate(); return; }
    const em = ctx.em;
    const params: Params = {
      mu: em.mu, lunitKm: em.lunit_km, tunitDays: em.tunit_s / 86400,
      rEarth: em.r_primary_km / em.lunit_km, rMoon: em.r_secondary_km / em.lunit_km,
      sunExclDeg: Number($<HTMLInputElement>("cv-sun").value), moonExclDeg: Number($<HTMLInputElement>("cv-moon").value),
      earthExclDeg: Number($<HTMLInputElement>("cv-earth").value), groundSunDeg: 20, groundMoonDeg: 5,
      areaM2: areaM2(), albedo: sda.photometry.albedo_default,
      days: 29.530589, steps: 60, sun0Deg: 0,
    };
    const res = $<HTMLSelectElement>("cv-res").value;
    const [nx, ny, nz] = res === "fine" ? [64, 56, 11] : res === "medium" ? [48, 42, 9] : [32, 28, 7];
    const tracks: TrackSpec[] = TRACK_SLUGS.map(slug => { const k = ko(slug); return { slug, points: k.points, times: k.times, period: k.period }; });
    worker?.terminate();
    worker = new Worker(new URL("./coverage.worker.ts", import.meta.url), { type: "module" });
    $("cv-run").textContent = "Running…";
    $("cv-run").setAttribute("disabled", "");
    worker.onmessage = (e: MessageEvent) => {
      const r = e.data as { coverage: Float32Array; positions: Float32Array; tracks: Record<string, number>; meanCoverage: number; fracAbove50: number; ms: number };
      lastPositions = r.positions; lastCoverage = r.coverage;
      render(r.positions, r.coverage);
      $("cv-run").textContent = "Run coverage";
      $("cv-run").removeAttribute("disabled");
      const rows = TRACK_SLUGS.map(slug => {
        const v = r.tracks[slug];
        return `<div class="bar-row"><span>${esc(ko(slug).title.replace(/ orbit| \(.*\)/g, ""))}</span><span class="bar"><i style="width:${(v * 100).toFixed(0)}%"></i></span><b>${(v * 100).toFixed(0)}%</b></div>`;
      }).join("");
      $("cv-stats").innerHTML = `
        <dl>
          <dt>Volume watched (time-average)</dt><dd>${(r.meanCoverage * 100).toFixed(0)}%</dd>
          <dt>Volume watched ≥ half the month</dt><dd>${(r.fracAbove50 * 100).toFixed(0)}%</dd>
        </dl>
        <h3 class="sub">Time each orbit is in view (one month)</h3>${rows}
        <p class="muted">${nx}×${ny}×${nz} grid, 60 time steps, ${(r.ms / 1000).toFixed(1)} s.</p>`;
      worker?.terminate(); worker = null;
    };
    worker.postMessage({ observers, tracks, params, grid: { nx, ny, nz, xr: [-0.25, 1.3], yr: [-0.75, 0.75], zr: [-0.35, 0.35] } });
  }
  $("cv-run").onclick = run;

  return {
    show(on: boolean) {
      group.visible = on;
      if (on) {
        drawSensors();
        ctx.fitTo([ctx.v3([-0.3, -0.8, 0]), ctx.v3([1.35, 0.8, 0])], "top");
        if (!lastCoverage) run();
      }
    },
  };
}
