// Shared context the Planner and Coverage modes use to draw into the viewer's scene.
import type * as THREE from "three";
import type { CSS2DObject } from "three/examples/jsm/renderers/CSS2DRenderer.js";
import type { OrbitMember, SystemInfo, Vec3 } from "./orbit";

export interface KeyOrbitData extends OrbitMember { slug: string; title: string; family: string; three_d: boolean }

export interface Ctx {
  S: number;
  em: SystemInfo;
  world: THREE.Group;
  keyOrbits: KeyOrbitData[];
  v3(p: Vec3): THREE.Vector3;
  label(text: string, cls?: string): CSS2DObject;
  clearGroup(g: THREE.Object3D): void;
  /** Frame the points. On phones the view is framed inside the clear area between the scene
   *  title and the toolbar, and `extra` points (context such as orbits at the route's stops) are
   *  framed too. `phoneOnly` skips the fit on wider screens; `labelRoom` keeps that many px free
   *  on the right on phones for labels that sit right of their points. */
  fitTo(points: THREE.Vector3[], view?: "top" | "side" | "front" | "iso", opts?: FitOpts): void;
  /** Stage size in CSS px (cached; reading it never forces a layout). */
  lineResolution(): { w: number; h: number };
  /** Called whenever the stage is resized. */
  onResize(fn: (w: number, h: number) => void): void;
  /** Ask for a redraw: the scene only renders when something changed. */
  invalidate(): void;
}

export interface FitOpts { extra?: THREE.Vector3[]; phoneOnly?: boolean; labelRoom?: number }

export const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

export function el<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Record<string, string> = {}, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (text !== undefined) e.textContent = text;
  return e;
}

export function esc(s: string): string {
  return s.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

/** Keep a range input's trace-coloured fill (CSS var --pct) in sync with its value. */
export function syncRange(input: HTMLInputElement): void {
  const min = Number(input.min || 0), max = Number(input.max || 100), v = Number(input.value);
  const pct = max > min ? ((v - min) / (max - min)) * 100 : 0;
  input.style.setProperty("--pct", `${pct.toFixed(1)}%`);
}
