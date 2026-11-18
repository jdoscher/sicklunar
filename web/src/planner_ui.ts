import * as THREE from "three";
import { Line2 } from "three/examples/jsm/lines/Line2.js";
import { LineGeometry } from "three/examples/jsm/lines/LineGeometry.js";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";
import { $, esc, type Ctx } from "./ctx";
import { ICONS } from "./icons";
import type { Vec3 } from "./orbit";
import {
  DEFAULT_OPTIONS, legDays, legDv, pareto, propellantFraction, routes,
  type Options, type Route, type Transfers,
} from "./planner";

// Where each planner node sits in the rotating Earth-Moon frame (nondim), and which orbit to draw.
function nodeGeometry(ctx: Ctx): Record<string, { anchor: Vec3; orbit?: Vec3[]; ring?: { c: Vec3; rKm: number }; offScale?: boolean }> {
  const mu = ctx.em.mu, L = ctx.em.lunit_km;
  const E: Vec3 = [-mu, 0, 0], M: Vec3 = [1 - mu, 0, 0];
  const ko = (slug: string) => ctx.keyOrbits.find(k => k.slug === slug)!;
  const centroid = (pts: Vec3[]): Vec3 => {
    const c: Vec3 = [0, 0, 0];
    for (const p of pts) { c[0] += p[0]; c[1] += p[1]; c[2] += p[2]; }
    return [c[0] / pts.length, c[1] / pts.length, c[2] / pts.length];
  };
  const lp = ctx.em.lagrange;
  const l4 = ko("17-l4-short-period").points;
  const l5 = l4.map(p => [p[0], -p[1], p[2]] as Vec3);
  return {
    earth: { anchor: E },
    leo: { anchor: [E[0] + 6778 / L, 0, 0], ring: { c: E, rKm: 6778 } },
    gto: { anchor: [E[0] - 24000 / L, 0, 0] },
    geo: { anchor: [E[0], 42164 / L, 0], ring: { c: E, rKm: 42164 } },
    tli: { anchor: [E[0] + 60000 / L, -20000 / L, 0] },
    llo: { anchor: [M[0], 1837 / L, 0], ring: { c: M, rKm: 1837 } },
    moon: { anchor: M },
    nrho: { anchor: lp.L2 as Vec3, orbit: ko("09-nrho-9-2").points },
    dro: { anchor: [M[0], -ko("14-dro").secondary_max_km / L, 0], orbit: ko("14-dro").points },
    eml1: { anchor: lp.L1 as Vec3, orbit: ko("07-l1-halo").points },
    eml2: { anchor: [lp.L2[0] + 0.03, 0, 0], orbit: ko("08-l2-halo").points },
    eml3: { anchor: lp.L3 as Vec3 },
    eml4: { anchor: centroid(l4), orbit: l4 },
    eml5: { anchor: centroid(l5), orbit: l5 },
    sel1: { anchor: [-0.75, -0.55, 0], offScale: true },
    sel2: { anchor: [-0.75, 0.55, 0], offScale: true },
    escape: { anchor: [1.45, 0.45, 0], offScale: true },
    cycler31: { anchor: [0.3, -0.45, 0] },
  };
}

const SHORT: Record<string, [string, number, number]> = {
  // short 3D label, x/y pixel offset (labels near Earth would otherwise overlap)
  earth: ["Earth surface", 10, 18], leo: ["LEO", -46, -16], gto: ["GTO", -44, 0], geo: ["GEO", 8, -14], tli: ["TLI", 8, 12],
  llo: ["LLO", 10, -16], moon: ["Lunar surface", 10, 16], nrho: ["NRHO", 10, 14], dro: ["DRO", 10, 0],
  eml1: ["EM-L1 halo", -80, -14], eml2: ["EM-L2 halo", 10, -14], eml3: ["EM-L3", 10, 0], eml4: ["EM-L4", 10, 0], eml5: ["EM-L5", 10, 0],
  sel1: ["Sun-Earth L1 (off scale)", 10, 0], sel2: ["Sun-Earth L2 (off scale)", 10, 0], escape: ["Deep space (off scale)", 10, 0], cycler31: ["3:1 cycler", 10, 0],
};

export function initPlanner(ctx: Ctx, data: Transfers) {
  const group = new THREE.Group();
  group.visible = false;
  ctx.world.add(group);
  const nodeName = (id: string) => data.nodes.find(n => n.id === id)?.name ?? id;
  const geom = nodeGeometry(ctx);
  const opts: Options = { ...DEFAULT_OPTIONS };
  let current: Route[] = [];
  let selected = 0;

  const from = $<HTMLSelectElement>("pl-from"), to = $<HTMLSelectElement>("pl-to");
  for (const sel of [from, to]) {
    for (const n of data.nodes) {
      if (n.id === "cycler31") continue;
      const o = document.createElement("option");
      o.value = n.id; o.textContent = n.name;
      sel.appendChild(o);
    }
  }
  from.value = "leo"; to.value = "llo";

  const routeMats: LineMaterial[] = [];
  function draw(route: Route | undefined) {
    ctx.clearGroup(group);
    routeMats.length = 0;
    const used = new Set<string>(route ? route.legs.flatMap(l => [l.from, l.to]) : [from.value, to.value]);
    const all: THREE.Vector3[] = [];
    // nodes
    for (const [id, g] of Object.entries(geom)) {
      if (id === "cycler31") continue;
      const on = used.has(id);
      const color = on ? 0x7ad4ff : 0x3b4556;
      if (g.orbit) {
        const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(g.orbit.map(ctx.v3)),
          new THREE.LineBasicMaterial({ color, transparent: true, opacity: on ? 0.9 : 0.5 }));
        group.add(line);
      }
      if (g.ring) {
        const pts: THREE.Vector3[] = [];
        for (let k = 0; k <= 128; k++) {
          const a = (2 * Math.PI * k) / 128, r = g.ring.rKm / ctx.em.lunit_km;
          pts.push(ctx.v3([g.ring.c[0] + r * Math.cos(a), g.ring.c[1] + r * Math.sin(a), 0]));
        }
        group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color, transparent: true, opacity: on ? 0.9 : 0.5 })));
      }
      const dot = new THREE.Points(
        new THREE.BufferGeometry().setAttribute("position", new THREE.BufferAttribute(new Float32Array([0, 0, 0]), 3)),
        new THREE.PointsMaterial({ color: on ? 0xf3f5f8 : 0x646f82, size: on ? 7 : 4, sizeAttenuation: false }),
      );
      dot.position.copy(ctx.v3(g.anchor)); // labels follow the object position, not the vertex
      if (on) {
        const [txt, dx, dy] = SHORT[id] ?? [nodeName(id), 10, 0];
        const lab = ctx.label(txt, "craft");
        lab.center.set(0.5, 0.5); // offsets below were tuned for centred labels
        lab.element.style.marginLeft = `${dx}px`;
        lab.element.style.marginTop = `${dy}px`;
        dot.add(lab);
      }
      group.add(dot);
      if (on) all.push(ctx.v3(g.anchor));
    }
    // legs as arcs
    if (route) {
      const { w, h } = ctx.lineResolution();
      route.legs.forEach((l, i) => {
        const a = ctx.v3(geom[l.from].anchor), b = ctx.v3(geom[l.to].anchor);
        const mid = a.clone().add(b).multiplyScalar(0.5);
        const lift = Math.max(2, a.distanceTo(b) * 0.25);
        mid.z += lift * (i % 2 ? -1 : 1);
        const curve = new THREE.QuadraticBezierCurve3(a, mid, b);
        const pts = curve.getPoints(64);
        const g = new LineGeometry();
        g.setPositions(pts.flatMap(p => [p.x, p.y, p.z]));
        // legs alternate ink and trace so consecutive legs stay distinguishable (orange is reserved for burns)
        const mat = new LineMaterial({ color: i % 2 ? 0x7ad4ff : 0xf3f5f8, linewidth: 3, worldUnits: false });
        mat.resolution.set(w, h);
        routeMats.push(mat);
        group.add(new Line2(g, mat));
        // arrow head at the end
        const tan = curve.getTangent(0.97).normalize();
        const cone = new THREE.Mesh(new THREE.ConeGeometry(0.6, 1.8, 12), new THREE.MeshBasicMaterial({ color: mat.color }));
        cone.position.copy(curve.getPoint(0.97));
        cone.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), tan);
        cone.scale.setScalar(Math.max(1, a.distanceTo(b) / 40));
        group.add(cone);
        pts.forEach(p => all.push(p));
      });
    }
    if (all.length) ctx.fitTo(all, "iso");
    ctx.invalidate();
  }

  function fmtDaysShort(d: number) { return d < 1 ? `${(d * 24).toFixed(0)} h` : `${d.toFixed(d < 10 ? 1 : 0)} d`; }

  function render() {
    const isp = Number($<HTMLSelectElement>("pl-isp").value);
    const list = $("pl-routes");
    const detail = $("pl-detail");
    if (from.value === to.value) { list.innerHTML = `<p class="muted">Pick two different places.</p>`; detail.innerHTML = ""; draw(undefined); return; }
    current = pareto(routes(data, from.value, to.value, opts));
    if (!current.length) {
      list.innerHTML = `<p class="muted">No route in the table with these options. Try allowing slow transfers, aerocapture or estimated legs.</p>`;
      detail.innerHTML = ""; draw(undefined); return;
    }
    selected = Math.min(selected, current.length - 1);
    const fastest = current[current.length - 1], cheapest = current[0];
    list.innerHTML = current.map((r, i) => {
      const tag = r === cheapest && r === fastest ? "cheapest & fastest" : r === cheapest ? "cheapest" : r === fastest ? "fastest" : "trade-off";
      const via = r.legs.slice(0, -1).map(l => nodeName(l.to)).join(" → ");
      return `<button class="route" aria-pressed="${i === selected}" data-i="${i}">
        <span class="rt-name"><span class="rt-tag">${tag}</span>
        <span class="rt-via">${via ? "via " + esc(via) : "direct"} · ${r.legs.length} leg${r.legs.length > 1 ? "s" : ""}</span></span>
        <span class="rt-num">${r.dv.toFixed(2)} km/s<small>${r.unknownTime ? "≥ " : ""}${fmtDaysShort(r.days)}</small></span></button>`;
    }).join("");
    for (const b of list.querySelectorAll("button")) (b as HTMLButtonElement).onclick = () => {
      selected = Number((b as HTMLElement).dataset.i); render();
      (list.querySelector(`button[data-i="${selected}"]`) as HTMLButtonElement | null)?.focus();
    };
    const r = current[selected];
    const frac = propellantFraction(r.dv, isp);
    detail.innerHTML = `
      <dl>
        <dt>Total delta-v</dt><dd>${r.dv.toFixed(2)} km/s</dd>
        <dt>Flight time</dt><dd>${r.unknownTime ? "≥ " : ""}${fmtDaysShort(r.days)}</dd>
        <dt>Propellant (Isp ${isp} s)</dt><dd>${(frac * 100).toFixed(0)}% of starting mass</dd>
      </dl>
      <ol class="legs">${r.legs.map(l => `
        <li><b>${esc(nodeName(l.from))} → ${esc(nodeName(l.to))}</b>
          <span>${legDv(l, opts).toFixed(2)} km/s (range ${l.dv_kms_min}–${l.dv_kms_max})${legDays(l, opts) !== null ? ` · ${fmtDaysShort(legDays(l, opts)!)}` : " · time n/a"}</span>
          <span class="muted">${esc(l.method)}</span>
          <span class="leg-meta"><span class="tag ${/^fact/i.test(l.label) && !l.reversed ? "stable" : "unstable"}">${l.reversed ? "Reversed leg (assumed)" : esc(l.label.split(":")[0])}</span>
          <a href="${esc(l.source_url)}" target="_blank" rel="noopener noreferrer">Source${ICONS.external}<span class="visually-hidden"> (opens in a new tab)</span></a></span></li>`).join("")}
      </ol>`;
    draw(r);
  }

  for (const id of ["pl-from", "pl-to", "pl-isp"]) $(id).addEventListener("change", () => { selected = 0; render(); });
  const bind = (id: string, key: keyof Options) => $<HTMLInputElement>(id).addEventListener("change", e => {
    (opts as unknown as Record<string, unknown>)[key] = (e.target as HTMLInputElement).checked; selected = 0; render();
  });
  bind("pl-rev", "allowReverse"); bind("pl-aero", "allowAerocapture"); bind("pl-slow", "allowSlow"); bind("pl-inf", "includeInference"); bind("pl-md", "includeMassDriver");
  $<HTMLSelectElement>("pl-est").addEventListener("change", e => { opts.estimate = (e.target as HTMLSelectElement).value as "min" | "max"; selected = 0; render(); });
  $("pl-swap").onclick = () => { const f = from.value; from.value = to.value; to.value = f; selected = 0; render(); };

  ctx.onResize((w, h) => { for (const m of routeMats) m.resolution.set(w, h); });

  return {
    show(on: boolean) { group.visible = on; if (on) render(); },
  };
}
