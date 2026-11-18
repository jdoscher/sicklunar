import "./site/base";
import "./site/nav";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { CSS2DRenderer, CSS2DObject } from "three/examples/jsm/renderers/CSS2DRenderer.js";
import { Line2 } from "three/examples/jsm/lines/Line2.js";
import { LineGeometry } from "three/examples/jsm/lines/LineGeometry.js";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";
import "./style.css";
import { BLURBS } from "./blurbs";
import { syncRange, type Ctx } from "./ctx";
import { ICONS } from "./icons";
import { cappedPixelRatio, nextTabIndex, parseMode, type Mode } from "./lab_logic";
import { initPlanner } from "./planner_ui";
import { initCoverage } from "./coverage_ui";
import { clearArea, fillShare, fitPoints, focalPx, screenBox, viewOffset, type P3, type Rect } from "./fit";
import {
  type Frame, type OrbitMember, type SystemInfo, type Vec3,
  bodyAt, fmtDays, fmtKm, niceKm, sampleAt, stabilityLabel, toFrame, trail,
} from "./orbit";

// ---------- data ----------
interface FamilyMeta { key: string; name: string; system: "earth-moon" | "sun-earth"; count: number; period_days: number[] }
interface KeyOrbit extends OrbitMember { slug: string; title: string; family: string; three_d: boolean }
interface Index { systems: Record<string, SystemInfo>; families: FamilyMeta[]; key_orbits: KeyOrbit[] }
interface FamilyData { key: string; name: string; system: string; count: number; members: OrbitMember[] }

const S = 100; // scene units per nondimensional length unit
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

// 3D colours from the design system (tokens.css --scene-*)
const COL = {
  bg: 0x04060a, star: 0x9aa6b8, pick: 0x7ad4ff, family: 0x2a3546, guide: 0x3b4556, lpt: 0x646f82,
  earth: 0x3e78b8, moon: 0xb9bcc2, sun: 0xffe6a8, craft: 0xf3f5f8,
};

const getJson = async (u: string) => (await fetch(u)).json();
const [index, transfers, sda, missions]: [Index, any, any, Mission[]] = await Promise.all(
  ["/data/index.json", "/data/transfers.json", "/data/sda.json", "/data/missions.json"].map(getJson) as Promise<any>[],
) as [Index, any, any, Mission[]];
interface Mission { name: string; operator: string; country: string; launch: string; status: string; orbit_type: string; purpose: string; source_url: string }
const ORBIT_TYPE: Record<string, string> = {
  "07-l1-halo": "EM-L1 halo", "08-l2-halo": "EM-L2 halo", "09-nrho-9-2": "NRHO", "14-dro": "DRO",
  "19-resonant-2-1": "resonant", "20-se-l2-halo": "SE-L2",
};
const famCache = new Map<string, FamilyData>();
async function loadFamily(key: string): Promise<FamilyData> {
  if (!famCache.has(key)) famCache.set(key, await (await fetch(`/data/families/${key}.json`)).json());
  return famCache.get(key)!;
}

// ---------- motion preference ----------
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");

// ---------- state ----------
const state = {
  familyKey: "halo-L2-S",
  memberIdx: 0,
  members: [] as OrbitMember[],
  current: null as OrbitMember | null,
  preset: null as KeyOrbit | null,
  frame: "rotating" as Frame,
  center: "secondary",
  playing: !reducedMotion.matches,
  t: 0, // nondim time
  speedDaysPerSec: 2,
  view: "iso" as "top" | "side" | "front" | "iso",
};
const sys = () => index.systems[index.families.find(f => f.key === state.familyKey)!.system];

// ---------- three ----------
const stage = $("stage");
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(cappedPixelRatio(devicePixelRatio, matchMedia("(pointer: coarse)").matches));
renderer.domElement.setAttribute("role", "img");
renderer.domElement.setAttribute("aria-label", "3D view of the selected orbit around Earth and the Moon. Drag to rotate, scroll or pinch to zoom.");
stage.prepend(renderer.domElement);
const labels = new CSS2DRenderer();
labels.domElement.style.position = "absolute";
labels.domElement.style.inset = "0";
labels.domElement.style.pointerEvents = "none";
labels.domElement.style.zIndex = "0"; // own stacking context: per-label z-index stays inside the stage
labels.domElement.setAttribute("aria-hidden", "true");
stage.insertBefore(labels.domElement, $("hud"));

const scene = new THREE.Scene();
scene.background = new THREE.Color(COL.bg);
const camera = new THREE.PerspectiveCamera(40, 1, 0.001, 1e6);
camera.up.set(0, 0, 1);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = !reducedMotion.matches;

// stars (about 5% drawn larger for depth)
{
  const make = (n: number, size: number) => {
    const g = new THREE.BufferGeometry();
    const a = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const v = new THREE.Vector3().randomDirection().multiplyScalar(5e4);
      a.set([v.x, v.y, v.z], i * 3);
    }
    g.setAttribute("position", new THREE.BufferAttribute(a, 3));
    scene.add(new THREE.Points(g, new THREE.PointsMaterial({ color: COL.star, size, sizeAttenuation: false, transparent: true, opacity: 0.7 })));
  };
  make(1425, 1.2);
  make(75, 2);
}

function label(text: string, cls = ""): CSS2DObject {
  const d = document.createElement("div");
  d.className = `label3d ${cls}`;
  d.textContent = text;
  const o = new CSS2DObject(d);
  o.center.set(0, 0.5); // label starts just right of its point (CSS2DRenderer owns the transform)
  return o;
}

const world = new THREE.Group(); // everything positioned in the active frame, shifted so the center is at origin
scene.add(world);

const primary = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 24), new THREE.MeshBasicMaterial({ color: COL.earth }));
const secondary = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 24), new THREE.MeshBasicMaterial({ color: COL.moon }));
const primaryLabel = label("Earth", "body"), secondaryLabel = label("Moon", "body");
primary.add(primaryLabel); secondary.add(secondaryLabel);
world.add(primary, secondary);

const lptGroup = new THREE.Group();
world.add(lptGroup);
const guides = new THREE.Group(); // Earth-Moon line or Moon orbit circle
world.add(guides);
const familyGroup = new THREE.Group();
world.add(familyGroup);

const orbitMat = new LineMaterial({ color: COL.pick, linewidth: 2.5, worldUnits: false });
const orbitLine = new Line2(new LineGeometry(), orbitMat);
world.add(orbitLine);

const craft = new THREE.Points(
  new THREE.BufferGeometry().setAttribute("position", new THREE.BufferAttribute(new Float32Array([0, 0, 0]), 3)),
  new THREE.PointsMaterial({ color: COL.craft, size: 9, sizeAttenuation: false }),
);
const craftLabel = label("Spacecraft", "craft");
craft.add(craftLabel);
world.add(craft);

function v3(p: Vec3): THREE.Vector3 { return new THREE.Vector3(p[0] * S, p[1] * S, p[2] * S); }

// ---------- render scheduling (draw only when something changes) ----------
let viewW = 1, viewH = 1; // cached stage size (ResizeObserver), never read in the frame loop
let dirty = true, rafId = 0, last = performance.now();
let mode: Mode = "viewer";
function invalidate() { dirty = true; wake(); }
function wake() {
  if (rafId) return;
  last = performance.now();
  rafId = requestAnimationFrame(tick);
}
controls.addEventListener("change", wake);
controls.addEventListener("start", wake);

// ---------- builders ----------
function buildLagrange() {
  clearGroup(lptGroup);
  const s = sys();
  const size = s.name === "Earth-Moon" ? 1.2 : 0.4;
  for (const [name, p] of Object.entries(s.lagrange)) {
    const g = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(-size, 0, 0), new THREE.Vector3(size, 0, 0),
      new THREE.Vector3(0, -size, 0), new THREE.Vector3(0, size, 0),
    ]);
    const m = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: COL.lpt }));
    m.userData.p = p;
    m.add(label(name));
    lptGroup.add(m);
  }
}

function buildGuides() {
  clearGroup(guides);
  const s = sys();
  const mat = new THREE.LineDashedMaterial({ color: COL.guide, dashSize: 2, gapSize: 2 });
  if (state.frame === "rotating") {
    const g = new THREE.BufferGeometry().setFromPoints([v3([-s.mu, 0, 0]), v3([1 - s.mu, 0, 0])]);
    const l = new THREE.Line(g, mat); l.computeLineDistances(); guides.add(l);
  } else {
    // path of the other body around the frame center
    const pts: THREE.Vector3[] = [];
    for (let k = 0; k <= 256; k++) {
      const t = (2 * Math.PI * k) / 256;
      const other = state.frame === "inertial-earth" ? "moon" : "earth";
      pts.push(v3(bodyAt(other, t, state.frame, s.mu)));
    }
    const l = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), mat); l.computeLineDistances(); guides.add(l);
  }
}

function setLine(line: Line2, pts: Vec3[]) {
  const flat: number[] = [];
  line.userData.fitcheck = "orbit";
  for (const p of pts) flat.push(p[0] * S, p[1] * S, p[2] * S);
  const g = new LineGeometry();
  g.setPositions(flat);
  line.geometry.dispose();
  line.geometry = g;
  line.computeLineDistances();
}

function trailSpan(m: OrbitMember): number {
  // inertial view: one sidereal month (2*pi) of motion, or one full period if longer
  return Math.max(2 * Math.PI, m.period);
}
function trailSteps(m: OrbitMember): number {
  return Math.min(30000, 600 * Math.ceil(trailSpan(m) / m.period));
}

/** Remove children and their CSS2D label elements (CSS2DRenderer leaves detached labels in the DOM). */
function clearGroup(g: THREE.Object3D) {
  g.traverse(o => { if (o instanceof CSS2DObject) o.element.remove(); });
  g.clear();
}

function buildOrbit() {
  const m = state.current!;
  const s = sys();
  if (state.frame === "rotating") setLine(orbitLine, m.points);
  else setLine(orbitLine, trail(m.points, m.period, 0, trailSpan(m), trailSteps(m), state.frame, s.mu, m.times));
  // family ghosts (rotating frame only)
  clearGroup(familyGroup);
  if (($("show-family") as HTMLInputElement).checked && state.frame === "rotating") {
    const famMat = new THREE.LineBasicMaterial({ color: COL.family });
    for (const fm of state.members) {
      if (fm === m) continue;
      const g = new THREE.BufferGeometry().setFromPoints(fm.points.map(v3));
      familyGroup.add(new THREE.Line(g, famMat));
    }
  }
}

function bodySizes() {
  const s = sys();
  const k = ($("big-bodies") as HTMLInputElement).checked ? 5 : 1;
  primary.scale.setScalar((s.r_primary_km / s.lunit_km) * S * k);
  secondary.scale.setScalar((s.r_secondary_km / s.lunit_km) * S * k);
  (primary.material as THREE.MeshBasicMaterial).color.set(s.name === "Earth-Moon" ? COL.earth : COL.sun);
  (secondary.material as THREE.MeshBasicMaterial).color.set(s.name === "Earth-Moon" ? COL.moon : COL.earth);
  primaryLabel.element.textContent = s.name === "Earth-Moon" ? "Earth" : "Sun";
  secondaryLabel.element.textContent = s.name === "Earth-Moon" ? "Moon" : "Earth";
}

// center of the view in frame coordinates
function centerPoint(): THREE.Vector3 {
  const s = sys();
  const m = state.current!;
  if (state.center === "orbit") {
    const box = new THREE.Box3().setFromPoints(m.points.map(p => v3(toFrame(p, 0, state.frame, s.mu))));
    return box.getCenter(new THREE.Vector3());
  }
  if (state.frame === "inertial-earth") return state.center === "primary" ? new THREE.Vector3() : v3(bodyAt("moon", state.t, state.frame, s.mu));
  if (state.frame === "inertial-moon") return state.center === "secondary" ? new THREE.Vector3() : v3(bodyAt("earth", state.t, state.frame, s.mu));
  if (state.center === "primary") return v3([-s.mu, 0, 0]);
  if (state.center === "secondary") return v3([1 - s.mu, 0, 0]);
  return new THREE.Vector3();
}

function fitCamera(view: View = "iso") {
  const s = sys();
  const m = state.current!;
  const pts = state.frame === "rotating" ? m.points : trail(m.points, m.period, 0, trailSpan(m), Math.min(4000, trailSteps(m)), state.frame, s.mu, m.times);
  fitTo(pts.map(v3), view, { optional: [centerPoint()] });
  state.view = view;
  for (const b of $("views").querySelectorAll("button")) b.setAttribute("aria-pressed", String((b as HTMLElement).dataset.view === view));
}

type View = "top" | "side" | "front" | "iso";
const VIEW_DIRS: Record<View, Vec3> = { top: [0, -0.001, 1], side: [0, -1, 0.001], front: [-1, 0, 0.001], iso: [-0.6, -1, 0.65] };
/** Phones and phone landscape: the scene title and toolbar sit over the canvas, so frame the
 *  orbit inside the clear area between them. Wider screens keep the original framing. */
const compactMQ = matchMedia("(max-width: 819px), (max-height: 500px)");
interface LabFit { extra?: THREE.Vector3[]; optional?: THREE.Vector3[]; labelRoom?: number; keepDir?: boolean }
let lastFit: { points: THREE.Vector3[]; view: View; opts: LabFit } | null = null;
let clear: Rect = { left: 0, top: 0, right: 1, bottom: 1 };
let overlayRects: DOMRect[] = []; // title band + toolbar (viewport coords) for hiding labels under them

/** Clear area of the stage (stage px), measured from the overlays' real boxes. */
function measureClear(): Rect {
  const sr = stage.getBoundingClientRect();
  const shown = (el: Element | null): el is HTMLElement => !!el && (el as HTMLElement).offsetParent !== null && el.getBoundingClientRect().height > 0;
  const title = $("title");
  const tops: number[] = [], bottoms: number[] = [];
  overlayRects = [];
  if (shown(title) && title.textContent) { const r = title.getBoundingClientRect(); tops.push(r.bottom - sr.top); overlayRects.push(r); }
  for (const el of [document.querySelector(".lab-views"), $("scalebar"), $("expand")]) {
    if (shown(el)) { const r = el.getBoundingClientRect(); bottoms.push(r.top - sr.top); overlayRects.push(r); }
  }
  return clearArea(viewW, viewH, tops, bottoms, 120);
}

/** Frame `points` (plus `extra` on phones). `optional` points (the chosen view centre) are always
 *  framed on wide screens; on phones only while the orbit still fills at least 60% of the clear area. */
function fitTo(points: THREE.Vector3[], view: View = "iso", opts: LabFit = {}) {
  const { extra = [], optional = [], labelRoom = 0, keepDir = false } = opts;
  lastFit = { points, view, opts: { ...opts, keepDir: false } };
  const box = new THREE.Box3().setFromPoints(optional.length ? points.concat(optional) : points);
  const dirV = keepDir ? camera.position.clone().sub(controls.target).normalize() : new THREE.Vector3(...VIEW_DIRS[view]).normalize();
  if (!compactMQ.matches) {
    camera.clearViewOffset();
    const size = box.getSize(new THREE.Vector3()).length() || 10;
    const fitH = (size / 2) / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    const dist = 1.15 * fitH / Math.min(1, camera.aspect);
    const look = box.getCenter(new THREE.Vector3());
    camera.position.copy(look).add(dirV.multiplyScalar(dist));
    controls.target.copy(look);
    camera.near = dist / 1000; camera.far = dist * 1000; camera.updateProjectionMatrix();
    invalidate();
    return;
  }
  clear = measureClear();
  const off = viewOffset(viewW, viewH, clear);
  camera.setViewOffset(viewW, viewH, off.x, off.y, viewW, viewH);
  const core = points.concat(extra);
  // Earth and Moon drawn inside the framed region: keep their whole disc in view
  const cbox = new THREE.Box3().setFromPoints(core);
  for (const body of [primary, secondary]) {
    const r = body.scale.x;
    if (!body.visible || !cbox.clone().expandByScalar(r).containsPoint(body.position)) continue;
    for (const a of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]] as Vec3[]) core.push(body.position.clone().add(new THREE.Vector3(...a).multiplyScalar(r)));
  }
  const pad = { left: 14, top: 14, right: 14 + labelRoom, bottom: 14 };
  const back = dirV;
  const right = new THREE.Vector3().crossVectors(camera.up, back).normalize();
  const up = new THREE.Vector3().crossVectors(back, right);
  const F = focalPx(camera.fov, viewH);
  const solve = (all: THREE.Vector3[]) => {
    const look = new THREE.Box3().setFromPoints(all).getCenter(new THREE.Vector3());
    const d = new THREE.Vector3();
    const basis = (p: THREE.Vector3): P3 => { d.subVectors(p, look); return [d.dot(right), d.dot(up), d.dot(back)]; };
    const fit = fitPoints(all.map(basis), F, clear, pad);
    const cx = (clear.left + clear.right) / 2, cy = (clear.top + clear.bottom) / 2;
    const share = fillShare(screenBox(core.map(basis), fit.dist, fit.pan, F, cx, cy) ?? fit.box, clear);
    return { look, fit, share: Math.max(share.w, share.h) };
  };
  let best = solve(core);
  if (optional.length) {
    const withCentre = solve(core.concat(optional));
    if (withCentre.share >= 0.6) best = withCentre;
  }
  const { look, fit } = best;
  const target = look.clone().addScaledVector(right, fit.pan[0]).addScaledVector(up, fit.pan[1]);
  controls.target.copy(target);
  camera.position.copy(target).addScaledVector(back, fit.dist);
  camera.near = fit.dist / 1000; camera.far = fit.dist * 1000; camera.updateProjectionMatrix();
  invalidate();
}

/** Hide 3D labels that would sit under the scene title or the toolbar (phones only). */
function hideCoveredLabels() {
  if (!compactMQ.matches || !overlayRects.length) return;
  for (const el of labels.domElement.children as HTMLCollectionOf<HTMLElement>) {
    if (el.style.display === "none") continue;
    const r = el.getBoundingClientRect();
    const hit = overlayRects.some(q => r.left < q.right && r.right > q.left && r.top < q.bottom && r.bottom > q.top);
    const v = hit ? "hidden" : "";
    if (el.style.visibility !== v) el.style.visibility = v;
  }
}

// ---------- UI ----------
const famSel = $<HTMLSelectElement>("family");
{
  const groups: Record<string, FamilyMeta[]> = {};
  const groupOf = (f: FamilyMeta) =>
    f.system === "sun-earth" ? "Sun-Earth (Terran space)" :
    /L4|L5/.test(f.key) ? "Around L4 / L5" :
    /^(dro|dpo|lpo|butterfly|dragonfly)/.test(f.key) ? "Around the Moon" :
    f.key.startsWith("resonant") ? "Lunar-resonant Earth orbits" : "Around L1 / L2 / L3";
  for (const f of index.families) (groups[groupOf(f)] ||= []).push(f);
  for (const [g, fs] of Object.entries(groups)) {
    const og = document.createElement("optgroup");
    og.label = g;
    for (const f of fs) {
      const o = document.createElement("option");
      o.value = f.key;
      o.textContent = `${f.name}  ·  ${f.period_days.length ? `${f.period_days[0].toFixed(1)}–${f.period_days[1].toFixed(1)} d` : ""}`;
      og.appendChild(o);
    }
    famSel.appendChild(og);
  }
}
const presets = $("presets");
for (const k of index.key_orbits) {
  const b = document.createElement("button");
  b.textContent = k.title.replace(/ \(.*\)$/, "").replace(" orbit", "");
  b.title = k.title;
  b.dataset.slug = k.slug;
  b.setAttribute("aria-pressed", "false");
  b.onclick = () => selectPreset(k);
  presets.appendChild(b);
}

function missionList(slug?: string): string {
  const t = slug && ORBIT_TYPE[slug];
  if (!t) return "";
  const ms = missions.filter(m => m.orbit_type === t);
  if (!ms.length) return "";
  const esc = (x: string) => x.replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
  return `<p>Missions in this orbit type (${ms.length}):</p><ul class="missions">${ms.map(m =>
    `<li><b>${esc(m.name)}</b> · ${esc(m.country)} · ${esc(m.launch)} · ${esc(m.status)}</li>`).join("")}</ul>`;
}

/** Scene title (one line on phones) and its subtitle; phones show the subtitle at the top of the panel. */
function setTitle(title: string, sub: string) {
  const esc = (x: string) => x.replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
  $("title").innerHTML = `${esc(title)}<small>${esc(sub)}</small>`;
  $("title").title = title;
  $("scene-sub").textContent = sub;
}
const FRAME_NOTE: Record<Frame, string> = { rotating: "rotating frame", "inertial-earth": "inertial, Earth-centered", "inertial-moon": "inertial, Moon-centered" };
function renderInfo() {
  const m = state.current!;
  const s = sys();
  const fam = index.families.find(f => f.key === state.familyKey)!;
  const p = state.preset;
  const [a, b] = s.name === "Earth-Moon" ? ["Moon", "Earth"] : ["Earth", "Sun"];
  const st = stabilityLabel(m.stability_index);
  $("info").innerHTML = `
    <h3>${p ? p.title : fam.name}</h3>
    <span class="tag ${m.stability_index > 1.001 ? "unstable" : "stable"}">${st} · index ${m.stability_index.toFixed(m.stability_index < 10 ? 2 : 0)}</span>
    ${p && BLURBS[p.slug] ? `<p>${BLURBS[p.slug]}</p>` : ""}
    ${missionList(p?.slug)}
    <dl>
      <dt>Period</dt><dd>${fmtDays(m.period_days)}</dd>
      <dt>Closest to ${a}</dt><dd>${fmtKm(m.secondary_min_km)}</dd>
      <dt>Farthest from ${a}</dt><dd>${fmtKm(m.secondary_max_km)}</dd>
      <dt>Distance to ${b}</dt><dd>${fmtKm(m.primary_min_km)} – ${fmtKm(m.primary_max_km)}</dd>
      <dt>Height (out of plane)</dt><dd>${fmtKm(m.z_extent_km)}</dd>
      <dt>Jacobi constant</dt><dd>${m.jacobi.toFixed(4)}</dd>
      <dt>Family</dt><dd>${fam.count.toLocaleString()} JPL members</dd>
    </dl>`;
  setTitle(p ? p.title : fam.name, `${s.name} ${FRAME_NOTE[state.frame]} · CR3BP model, not mission-grade`);
  $("member-label").textContent = p && state.memberIdx < 0 ? "preset" : `${state.memberIdx + 1} / ${state.members.length}`;
  for (const btn of presets.querySelectorAll("button")) btn.setAttribute("aria-pressed", String(btn.dataset.slug === p?.slug));
}

async function selectFamily(key: string, memberIdx = 0, keepPreset: KeyOrbit | null = null) {
  state.familyKey = key;
  famSel.value = key;
  const fd = await loadFamily(key);
  state.members = fd.members;
  const slider = $<HTMLInputElement>("member");
  slider.max = String(fd.members.length - 1);
  state.preset = keepPreset;
  if (keepPreset) {
    state.current = keepPreset;
    // place the slider at the nearest sampled member by period
    let best = 0;
    fd.members.forEach((m, i) => { if (Math.abs(m.period - keepPreset.period) < Math.abs(fd.members[best].period - keepPreset.period)) best = i; });
    slider.value = String(best);
    state.memberIdx = -1;
  } else {
    state.memberIdx = memberIdx;
    slider.value = String(memberIdx);
    state.current = fd.members[memberIdx];
  }
  syncRange(slider);
  rebuild(true);
}

function selectPreset(k: KeyOrbit) {
  const sysKey = index.families.find(f => f.key === k.family)!.system;
  if (sysKey === "sun-earth") { state.center = "secondary"; }
  void selectFamily(k.family, 0, k);
  const url = new URL(location.href); url.hash = k.slug; history.replaceState(null, "", url);
}

function rebuild(refit = false) {
  bodySizes();
  buildLagrange();
  buildGuides();
  buildOrbit();
  renderInfo();
  state.t = 0;
  updateBodies();
  if (refit) fitCamera("iso");
  invalidate();
}

famSel.onchange = () => void selectFamily(famSel.value, 0);
$<HTMLInputElement>("member").oninput = (e) => {
  state.memberIdx = Number((e.target as HTMLInputElement).value);
  state.current = state.members[state.memberIdx];
  state.preset = null;
  rebuild(false);
};
$<HTMLSelectElement>("frame").onchange = (e) => { state.frame = (e.target as HTMLSelectElement).value as Frame; rebuild(true); };
$<HTMLSelectElement>("center").onchange = (e) => { state.center = (e.target as HTMLSelectElement).value; fitCamera("iso"); };
for (const id of ["show-family", "big-bodies"]) $(id).onchange = () => rebuild(false);
$("show-lpts").onchange = (e) => { lptGroup.visible = (e.target as HTMLInputElement).checked; invalidate(); };
$("show-labels").onchange = (e) => { labels.domElement.style.display = (e.target as HTMLInputElement).checked ? "" : "none"; invalidate(); };
for (const b of $("views").querySelectorAll("button")) (b as HTMLButtonElement).onclick = () => fitCamera((b as HTMLButtonElement).dataset.view as View);

// play / pause (starts paused when the system asks for reduced motion)
const playBtn = $<HTMLButtonElement>("play");
function setPlaying(on: boolean) {
  state.playing = on;
  playBtn.innerHTML = on ? ICONS.pause : ICONS.play;
  playBtn.setAttribute("aria-label", on ? "Pause animation" : "Play animation");
  playBtn.title = on ? "Pause animation" : "Play animation";
  if (on) wake();
}
playBtn.onclick = () => setPlaying(!state.playing);
setPlaying(state.playing);
reducedMotion.addEventListener("change", () => {
  controls.enableDamping = !reducedMotion.matches;
  if (reducedMotion.matches) setPlaying(false);
});

const speed = $<HTMLInputElement>("speed");
function speedFromSlider() {
  // 0..100 -> 0.05 .. 60 days per second (log scale)
  state.speedDaysPerSec = 0.05 * Math.pow(1200, Number(speed.value) / 100);
  $("speed-label").textContent = `${state.speedDaysPerSec < 1 ? (state.speedDaysPerSec * 24).toFixed(1) + " h" : state.speedDaysPerSec.toFixed(1) + " days"} / s`;
}
speed.oninput = speedFromSlider;
speedFromSlider();

// range fills
for (const r of document.querySelectorAll<HTMLInputElement>('input[type="range"]')) syncRange(r);
document.addEventListener("input", e => { const t = e.target as HTMLInputElement; if (t?.type === "range") syncRange(t); });

// ---------- modes (tabs) ----------
let planner: { show(on: boolean): void } | null = null;
let coverage: { show(on: boolean): void } | null = null;
const tabs = Array.from($("modes").querySelectorAll<HTMLButtonElement>('[role="tab"]'));
async function setMode(m: Mode) {
  for (const o of tabs) {
    const on = o.dataset.mode === m;
    o.setAttribute("aria-selected", String(on));
    o.tabIndex = on ? 0 : -1;
  }
  for (const k of ["viewer", "planner", "coverage"]) ($(`mode-${k}`)).hidden = k !== m;
  if (m !== "viewer") {
    // Planner and Coverage work in the Earth-Moon rotating frame
    if (sys().name !== "Earth-Moon" || state.frame !== "rotating") {
      state.frame = "rotating";
      ($("frame") as HTMLSelectElement).value = "rotating";
      if (sys().name !== "Earth-Moon") await selectFamily("halo-L2-S", 0); else rebuild(false);
    }
  }
  mode = m;
  const viewerOn = m === "viewer";
  orbitLine.visible = craft.visible = familyGroup.visible = viewerOn;
  (document.querySelector(".lab-views") as HTMLElement).hidden = !viewerOn;
  planner?.show(m === "planner");
  coverage?.show(m === "coverage");
  if (viewerOn) { renderInfo(); fitCamera(state.view); }
  else if (m === "planner") setTitle("Transfer planner", "Earth-Moon rotating frame · routes from cited delta-v tables");
  else setTitle("Coverage", "Share of one month each region is in view · Earth-Moon rotating frame");
  const url = new URL(location.href);
  if (m === "viewer") url.searchParams.delete("mode"); else url.searchParams.set("mode", m);
  history.replaceState(null, "", url);
  invalidate();
}
tabs.forEach((b, i) => {
  b.onclick = () => void setMode(parseMode(b.dataset.mode));
  b.onkeydown = (e) => {
    const j = nextTabIndex(e.key, i, tabs.length);
    if (j === null) return;
    e.preventDefault();
    tabs[j].focus();
    void setMode(parseMode(tabs[j].dataset.mode));
  };
});

// ---------- collapsible panel (phones) ----------
const app = $("app"), panel = $("panel"), collapseBtn = $("collapse"), expandBtn = $("expand");
let refitOnResize = false; // re-frame the scene after the panel opens or closes
collapseBtn.onclick = () => {
  refitOnResize = true;
  panel.classList.add("collapsed"); app.classList.add("panel-collapsed");
  expandBtn.hidden = false; collapseBtn.setAttribute("aria-expanded", "false"); expandBtn.focus();
};
expandBtn.onclick = () => {
  refitOnResize = true;
  panel.classList.remove("collapsed"); app.classList.remove("panel-collapsed");
  expandBtn.hidden = true; collapseBtn.setAttribute("aria-expanded", "true"); collapseBtn.focus();
};

// ---------- sizing (cached; no layout reads in the frame loop) ----------
const resizeFns: ((w: number, h: number) => void)[] = [];
function applySize(w: number, h: number) {
  if (w < 1 || h < 1) return;
  viewW = w; viewH = h;
  renderer.setSize(w, h);
  labels.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  orbitMat.resolution.set(w, h);
  for (const f of resizeFns) f(w, h);
  if (refitOnResize) {
    refitOnResize = false;
    if (mode === "viewer") { if (state.current) fitCamera(state.view); }
    else if (mode === "planner") planner?.show(true);
    else coverage?.show(true);
  } else if (compactMQ.matches && lastFit) {
    // phones: re-frame after rotation or a resize, keeping the angle the user turned to
    fitTo(lastFit.points, lastFit.view, { ...lastFit.opts, keepDir: true });
  }
  invalidate();
}
new ResizeObserver(entries => {
  const r = entries[entries.length - 1].contentRect;
  applySize(Math.round(r.width), Math.round(r.height));
}).observe(stage);
applySize(stage.clientWidth, stage.clientHeight); // one read at startup

// ---------- frame loop ----------
const clockEl = $("clock");
const scaleBar = $("scalebar").querySelector(".bar") as HTMLElement;
const scaleText = $("scalebar").querySelector("span") as HTMLElement;
let lastClock = "", lastBarW = "", lastBarText = "";

function updateBodies() {
  const s = sys();
  const m = state.current;
  if (!m) return;
  const span = state.frame === "rotating" ? m.period : trailSpan(m);
  craft.position.copy(v3(toFrame(sampleAt(m.points, m.period, state.t, m.times), state.t, state.frame, s.mu)));
  primary.position.copy(v3(bodyAt("earth", state.t, state.frame, s.mu)));
  secondary.position.copy(v3(bodyAt("moon", state.t, state.frame, s.mu)));
  for (const l of lptGroup.children) l.position.copy(v3(toFrame(l.userData.p, state.t, state.frame, s.mu)));
  const clock = `t = ${((state.t * s.tunit_s) / 86400).toFixed(2)} days of ${((span * s.tunit_s) / 86400).toFixed(1)}${state.frame === "rotating" ? " (one period)" : " shown"}`;
  if (clock !== lastClock) { clockEl.textContent = clock; lastClock = clock; }
}

function updateScaleBar() {
  const s = sys();
  const dist = camera.position.distanceTo(controls.target);
  const pxPerUnit = viewH / 2 / (dist * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)));
  const kmPerUnit = s.lunit_km / S;
  const spanKm = (viewW / pxPerUnit) * kmPerUnit;
  const bar = niceKm(compactMQ.matches ? spanKm / 2.5 : spanKm); // phones: a short bar, clear of the view buttons
  const w = `${Math.round((bar / kmPerUnit) * pxPerUnit)}px`;
  const text = `${bar.toLocaleString("en-US")} km`;
  if (w !== lastBarW) { scaleBar.style.width = w; lastBarW = w; }
  if (text !== lastBarText) { scaleText.innerHTML = `${text}<span class="narrow-hide"> at view center</span>`; lastBarText = text; }
}

function tick(now: number) {
  rafId = 0;
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  const s = sys();
  const m = state.current;
  const animating = !!m && state.playing && mode === "viewer";
  if (animating) {
    state.t += (dt * state.speedDaysPerSec * 86400) / s.tunit_s;
    const span = state.frame === "rotating" ? m!.period : trailSpan(m!);
    if (state.t > span) state.t -= span;
    updateBodies();
  }
  const moved = controls.update();
  if (animating || moved || dirty) {
    dirty = false;
    renderer.render(scene, camera);
    labels.render(scene, camera);
    hideCoveredLabels();
    updateScaleBar();
  }
  // keep looping only while something moves (playing, or the camera is still damping)
  if ((animating || moved) && !rafId) rafId = requestAnimationFrame(tick);
}

// ---------- start ----------
addEventListener("hashchange", () => {
  const k = index.key_orbits.find(k => k.slug === location.hash.slice(1));
  if (k && k !== state.preset) { if (mode !== "viewer") void setMode("viewer"); selectPreset(k); }
});
const startSlug = location.hash.slice(1);
const start = index.key_orbits.find(k => k.slug === startSlug) ?? index.key_orbits.find(k => k.slug === "09-nrho-9-2")!;
selectPreset(start);
const ctx: Ctx = {
  S, em: index.systems["earth-moon"], world, keyOrbits: index.key_orbits, v3, label, clearGroup,
  fitTo: (points, view, o = {}) => { if (!o.phoneOnly || compactMQ.matches) fitTo(points, view, { extra: o.extra, labelRoom: o.labelRoom }); },
  lineResolution: () => ({ w: viewW, h: viewH }),
  onResize: fn => { resizeFns.push(fn); },
  invalidate,
};
compactMQ.addEventListener("change", () => { if (lastFit) fitTo(lastFit.points, lastFit.view, { ...lastFit.opts, keepDir: true }); });
planner = initPlanner(ctx, transfers);
coverage = initCoverage(ctx, sda);
const startMode = parseMode(new URL(location.href).searchParams.get("mode"));
if (startMode !== "viewer") setTimeout(() => void setMode(startMode), 300);
invalidate();

// Verification hook, only in `vite build --mode fitcheck` builds (stripped from normal builds):
// projects every drawn path tagged with userData.fitcheck to stage pixels so a browser test can
// check it stays inside the clear area.
if (import.meta.env.MODE === "fitcheck") {
  (window as unknown as { __fit: unknown }).__fit = {
    sample() {
      renderer.render(scene, camera);
      labels.render(scene, camera);
      hideCoveredLabels();
      scene.updateMatrixWorld(true);
      const sets: Record<string, number[][]> = {};
      const v = new THREE.Vector3();
      const visible = (o: THREE.Object3D | null): boolean => { for (; o; o = o.parent) if (!o.visible) return false; return true; };
      world.traverse(o => {
        const tag = o.userData.fitcheck as string | undefined;
        if (!tag || !visible(o)) return;
        const g = (o as THREE.Mesh).geometry as THREE.BufferGeometry | undefined;
        const out = (sets[tag] ||= []);
        const push = () => { v.applyMatrix4(o.matrixWorld).project(camera); out.push([(v.x + 1) / 2 * viewW, (1 - v.y) / 2 * viewH, v.z]); };
        const start = g?.getAttribute("instanceStart") as THREE.InterleavedBufferAttribute | undefined;
        const end = g?.getAttribute("instanceEnd") as THREE.InterleavedBufferAttribute | undefined;
        if (start && end) {
          for (let i = 0; i < start.count; i++) { v.set(start.getX(i), start.getY(i), start.getZ(i)); push(); }
          if (end.count) { const i = end.count - 1; v.set(end.getX(i), end.getY(i), end.getZ(i)); push(); }
        } else if (g?.getAttribute("position")) {
          const pos = g.getAttribute("position");
          for (let i = 0; i < pos.count; i++) { v.set(pos.getX(i), pos.getY(i), pos.getZ(i)); push(); }
        } else { v.set(0, 0, 0); push(); }
      });
      // the region the last fit framed (the coverage grid's corners, the route, the orbit)
      sets.frame = (lastFit?.points ?? []).map(p => { v.copy(p).applyMatrix4(world.matrixWorld).project(camera); return [(v.x + 1) / 2 * viewW, (1 - v.y) / 2 * viewH, v.z]; });
      const sr = stage.getBoundingClientRect();
      const labelRects = [...labels.domElement.children as HTMLCollectionOf<HTMLElement>]
        .filter(el => el.style.display !== "none" && el.style.visibility !== "hidden" && el.textContent)
        .map(el => { const r = el.getBoundingClientRect(); return { text: el.textContent, left: r.left - sr.left, top: r.top - sr.top, right: r.right - sr.left, bottom: r.bottom - sr.top }; });
      const rel = (r: DOMRect) => ({ left: r.left - sr.left, top: r.top - sr.top, right: r.right - sr.left, bottom: r.bottom - sr.top });
      return { stage: { w: viewW, h: viewH }, clear: measureClear(), overlays: overlayRects.map(rel), sets, labels: labelRects };
    },
  };
}
