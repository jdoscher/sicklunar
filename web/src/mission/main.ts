import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { CSS2DObject, CSS2DRenderer } from "three/examples/jsm/renderers/CSS2DRenderer.js";
import { Line2 } from "three/examples/jsm/lines/Line2.js";
import { LineGeometry } from "three/examples/jsm/lines/LineGeometry.js";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";
import "../site/base";
import "../site/nav";
import "./mission.css";
import { icon, mountSprite } from "./icons";
import { loadFlight, loadPlanningData } from "./data";
import { CHALLENGES, DESTINATIONS, GLOSSARY, PHASES, SITE_LESSON, type Challenge, type DestId, type PhaseId } from "./content";
import {
  elongationDeg, equatorialToEcliptic, gmstDeg, illuminatedFraction, julianDay, moonDirEcliptic, moonEcliptic, phaseName, sunDirEcliptic,
} from "./ephem";
import {
  buildMission, missionToWall, segmentAt, totalWall, wallToMission, type Mission, type Segment, type V,
} from "./geometry";
import {
  calendarMarks, DEFAULT_LUNAR_SITE, earthEverVisible, EXPLORER_TANK, isPolarSite, LANDER_TANK, landingPlain, landingVerdict, maxInclination,
  minInclination, needsPolarOrbit, nextGoodDay, plan, rateMonth, spinBonusKms, tankForDest, toUnits, type LunarSite, type Plan,
} from "./model";

mountSprite();

// ------------------------------------------------------------ data
const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const PD = await loadPlanningData();
const transfers = PD.transfers;
const SITES = PD.sites;
const SYS = PD.system;
const LUNAR: LunarSite[] = PD.lunar.length ? PD.lunar : [DEFAULT_LUNAR_SITE];
const LANDABLE = LUNAR.filter(l => l.kind !== "crash");
const DEST_GROUPS: [string, DestId[]][] = [
  ["Around Earth", ["leo", "geo"]],
  ["To the Moon", ["flyby", "llo", "surface"]],
  ["Far orbits and balance points", ["nrho", "dro", "l1halo", "l2halo", "l4"]],
];
const MOON_DESTS = ["llo", "surface", "dro", "nrho", "l1halo", "l2halo", "l4"];

// ------------------------------------------------------------ state
const saved = JSON.parse(localStorage.getItem("cislunar-mission") || "{}");
const today = new Date();
const todayUtc = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
const state = {
  dest: (saved.dest as DestId) || "llo",
  siteId: (saved.siteId as string) || "ksc",
  date: new Date(todayUtc),
  calYear: today.getUTCFullYear(), calMonth: today.getUTCMonth(),
  tank: Number(saved.tank) === LANDER_TANK ? LANDER_TANK : EXPLORER_TANK,
  landingId: (saved.landingId as string) || "apollo-11",
  challenge: null as Challenge | null,
  step: 1,
  landFilter: "all",
  landQuery: "",
};
if (!DESTINATIONS[state.dest]) state.dest = "llo";
const done: Record<string, { sites?: string[]; ok?: boolean }> = JSON.parse(localStorage.getItem("cislunar-challenges") || "{}");
const site = () => SITES.find(s => s.id === state.siteId) ?? SITES[0];
const save = () => localStorage.setItem("cislunar-mission", JSON.stringify({ dest: state.dest, siteId: state.siteId, tank: state.tank, landingId: state.landingId }));
const landing = () => LANDABLE.find(l => l.id === state.landingId) ?? LANDABLE.find(l => l.id === "apollo-11") ?? LANDABLE[0] ?? DEFAULT_LUNAR_SITE;

// reduce motion: follows the OS setting unless the visible toggle was used
const osRM = matchMedia("(prefers-reduced-motion: reduce)");
const storedRM = localStorage.getItem("cislunar-reduce-motion");
let reduceMotion = storedRM === null ? osRM.matches : storedRM === "1";
function applyMotion() {
  document.body.classList.toggle("reduce-motion", reduceMotion);
  $("motion-toggle").setAttribute("aria-pressed", String(reduceMotion));
}
$("motion-toggle").onclick = () => { reduceMotion = !reduceMotion; localStorage.setItem("cislunar-reduce-motion", reduceMotion ? "1" : "0"); applyMotion(); };
osRM.addEventListener("change", () => { if (localStorage.getItem("cislunar-reduce-motion") === null) { reduceMotion = osRM.matches; applyMotion(); } });
applyMotion();

// ------------------------------------------------------------ text helpers
const esc = (s: string) => s.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const fmtU = (u: number) => (Math.round(u * 10) / 10).toFixed(1);
const fmtDate = (d: Date) => d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
const fmtLocal = (d: Date) => d.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
const SHORT_BURN: Record<string, string> = { tli: "Leave Earth", loi: "Brake at Moon", insert: "Match orbit", descent: "Land", gto: "Boost up", geo: "Round out at GEO" };

// glossary aliases: term text, its abbreviation in parentheses, plus a few extra spellings
const ALIASES: [string, string][] = [];
for (const [k, g] of Object.entries(GLOSSARY)) {
  const base = g.term.replace(/\s*\(.*\)/, "").trim();
  ALIASES.push([base, k]);
  const abbr = g.term.match(/\(([^)]+)\)/)?.[1];
  if (abbr) ALIASES.push([abbr, k]);
}
ALIASES.push(["units", "fuel-unit"], ["unit", "fuel-unit"], ["tilt", "inclination"], ["spin bonus", "spin-bonus"], ["low lunar orbit", "llo"],
  ["geostationary", "geo"], ["lunar orbit", "llo"], ["polar orbit", "polar-orbit"], ["far side", "far-side"], ["relay satellite", "relay-satellite"],
  ["south pole", "south-pole"], ["shadowed", "permanently-shadowed-region"], ["nods", "libration"], ["re-entry", "reentry"], ["gravity well", "gravity"], ["three-body", "three-body-problem"]);
ALIASES.sort((a, b) => b[0].length - a[0].length);
const ALIAS_RE = ALIASES.filter(([a]) => a.length >= 3 || a === "L1" || a === "L2").map(([alias, key]) =>
  [new RegExp(`(^|[^A-Za-z0-9-])(${alias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})(?![A-Za-z0-9])`, alias === alias.toUpperCase() ? "" : "i"), key] as const);

/** Escape text and turn glossary terms into tappable buttons (first match of each term only). */
function linkify(text: string): string {
  const parts: string[] = [];
  let rest = text;
  const used = new Set<string>();
  for (let guard = 0; guard < 60; guard++) {
    let best: { i: number; len: number; key: string } | null = null;
    for (const [re, key] of ALIAS_RE) {
      if (used.has(key)) continue;
      const m = re.exec(rest);
      if (m) {
        const i = m.index + m[1].length;
        if (!best || i < best.i || (i === best.i && m[2].length > best.len)) best = { i, len: m[2].length, key };
      }
    }
    if (!best) break;
    parts.push(esc(rest.slice(0, best.i)));
    parts.push(`<button type="button" class="term" data-term="${best.key}">${esc(rest.slice(best.i, best.i + best.len))}</button>`);
    used.add(best.key);
    rest = rest.slice(best.i + best.len);
  }
  parts.push(esc(rest));
  return parts.join("");
}

const live = (text: string) => { const el = $("sr-live"); el.textContent = ""; window.setTimeout(() => { el.textContent = text; }, 30); };

// ------------------------------------------------------------ popover (glossary) + dialogs
const popover = $("popover");
let popOpener: HTMLElement | null = null;
function closePopover(refocus = false) {
  if (popover.hidden) return;
  popover.hidden = true;
  if (refocus) popOpener?.focus();
}
document.addEventListener("click", (e) => {
  const t = (e.target as HTMLElement).closest("button.term") as HTMLElement | null;
  if (t) {
    const g = GLOSSARY[t.dataset.term!];
    if (!g) return;
    popOpener = t;
    popover.innerHTML = `<button type="button" class="btn icon-only close" aria-label="Close">${icon("i-close")}</button><h4 id="pop-h">${esc(g.term)}</h4><div>${esc(g.short)}</div>${g.more ? `<div class="more">${esc(g.more)}</div>` : ""}`;
    popover.hidden = false;
    const r = t.getBoundingClientRect();
    const w = Math.min(340, innerWidth - 20);
    popover.style.left = `${Math.max(10, Math.min(innerWidth - w - 10, r.left))}px`;
    const below = r.bottom + 8;
    popover.style.top = `${below + popover.offsetHeight > innerHeight - 10 ? Math.max(10, r.top - 8 - popover.offsetHeight) : below}px`;
    popover.querySelector<HTMLElement>(".close")!.onclick = () => closePopover(true);
    (popover.querySelector(".close") as HTMLElement).focus();
    e.stopPropagation();
    return;
  }
  if (!(e.target as HTMLElement).closest("#popover")) closePopover();
});

const modal = $<HTMLDialogElement>("modal");
let modalOpener: HTMLElement | null = null;
function openModal(html: string) {
  closePopover();
  modalOpener = document.activeElement as HTMLElement | null;
  modal.querySelector(".modal-body")!.innerHTML = html;
  if (!modal.open) modal.showModal();
  const first = modal.querySelector<HTMLElement>(".modal-body button, .modal-body a, .modal-body input");
  (first ?? modal.querySelector<HTMLElement>(".close"))!.focus();
}
modal.querySelector<HTMLElement>(".close")!.onclick = () => modal.close();
modal.addEventListener("click", (e) => { if (e.target === modal) modal.close(); });
modal.addEventListener("close", () => { if (modalOpener && document.contains(modalOpener)) modalOpener.focus(); modalOpener = null; });
addEventListener("keydown", (e) => { if (e.key === "Escape" && !popover.hidden) { closePopover(true); e.preventDefault(); } });

function fillPlaceholders(s: string, vars: Record<string, string>): string {
  return s.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? `{${k}}`);
}

// ------------------------------------------------------------ roving-tabindex radio groups
function radioKeys(box: HTMLElement, sel: string, onPick: (el: HTMLElement) => void) {
  box.addEventListener("keydown", (e) => {
    const items = [...box.querySelectorAll<HTMLElement>(sel)].filter(x => x.offsetParent !== null && !(x as HTMLButtonElement).disabled);
    const i = items.indexOf(document.activeElement as HTMLElement);
    if (i < 0) return;
    const n = items.length;
    let j: number;
    if (e.key === "ArrowDown" || e.key === "ArrowRight") j = (i + 1) % n;
    else if (e.key === "ArrowUp" || e.key === "ArrowLeft") j = (i - 1 + n) % n;
    else if (e.key === "Home") j = 0;
    else if (e.key === "End") j = n - 1;
    else return;
    e.preventDefault();
    items[j].focus();
    onPick(items[j]);
  });
}
function syncRoving(box: HTMLElement, sel: string, attr = "aria-checked") {
  const items = [...box.querySelectorAll<HTMLElement>(sel)];
  const visible = items.filter(x => !(x as HTMLButtonElement).disabled);
  const on = visible.find(x => x.getAttribute(attr) === "true") ?? visible[0];
  for (const x of items) x.tabIndex = x === on ? 0 : -1;
}

// ------------------------------------------------------------ moon icon
function moonIcon(jd: number): string {
  const k = illuminatedFraction(jd);
  const waxing = elongationDeg(jd) < 180;
  const r = 9, cx = 10, cy = 10;
  const rx = Math.abs(1 - 2 * k) * r;
  const s = waxing ? 1 : 0;
  const sweep = k > 0.5 ? (waxing ? 0 : 1) : (waxing ? 1 : 0);
  const d = `M ${cx} ${cy - r} A ${r} ${r} 0 0 ${s} ${cx} ${cy + r} A ${rx} ${r} 0 0 ${sweep} ${cx} ${cy - r} Z`;
  return `<svg class="moon" viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="9" fill="#2A3242"/><path d="${d}" fill="#F3F5F8"/></svg>`;
}

// ------------------------------------------------------------ planner UI: destinations
const destBox = $("dests");
destBox.innerHTML = DEST_GROUPS.map(([g, ids]) => `<span class="label grp" aria-hidden="true">${esc(g)}</span>${ids.map(id => {
  const d = DESTINATIONS[id];
  return `<button type="button" class="dest" role="radio" data-dest="${id}" aria-checked="false">${icon(d.glyph, "g")}<span><b>${esc(d.name)}</b><small>${esc(d.tagline)}</small><span class="over-note" hidden>${icon("i-alert")}Too much for your tank</span></span><span class="u"><span class="uv"></span><em>units</em></span></button>`;
}).join("")}`).join("");
const pickDest = (id: DestId) => {
  const was = state.dest;
  state.dest = id;
  if (id === "surface") {
    state.tank = tankForDest(id, state.tank);
    if (was !== "surface") jumpToGoodDay();
  }
  save(); refresh();
  if (flying) return;
  if (id === "surface") focusLanding();
  else if (was === "surface") focusSite();
};
for (const b of destBox.querySelectorAll<HTMLElement>(".dest")) b.onclick = () => pickDest(b.dataset.dest as DestId);
radioKeys(destBox, ".dest", el => pickDest(el.dataset.dest as DestId));

// launch sites
const siteBox = $("sites");
for (const s of SITES) {
  const b = document.createElement("button");
  b.type = "button";
  b.className = "chip";
  b.setAttribute("role", "radio");
  b.dataset.site = s.id;
  b.innerHTML = `${esc(s.short_name)} <small>${Math.abs(s.lat).toFixed(0)}°${s.lat >= 0 ? "N" : "S"}</small>`;
  b.onclick = () => selectSite(s.id);
  siteBox.appendChild(b);
}
radioKeys(siteBox, ".chip", el => selectSite(el.dataset.site!));
function selectSite(id: string) { state.siteId = id; save(); refresh(); if (!flying) focusSite(); }

// landing sites: filter chips + search
const landMatches = (l: LunarSite) => {
  const f = state.landFilter;
  if (f === "pole" && l.region !== "south-pole") return false;
  if (f === "artemis" && !/artemis/i.test(l.id + " " + l.mission)) return false;
  if (f === "history" && l.kind !== "historic") return false;
  const q = state.landQuery.trim().toLowerCase();
  return !q || `${l.name} ${l.mission} ${l.agency} ${l.country}`.toLowerCase().includes(q);
};
function renderLands() {
  const groups: [string, LunarSite[]][] = [
    ["Future landing zones", LANDABLE.filter(l => (l.kind === "planned" || l.kind === "candidate") && landMatches(l))],
    ["History: where we've landed", LANDABLE.filter(l => l.kind === "historic" && landMatches(l)).sort((a, b) => (a.date ?? "").localeCompare(b.date ?? ""))],
  ];
  const box = $("lands");
  box.innerHTML = groups.filter(([, l]) => l.length).map(([t, l]) => `<span class="label grp" aria-hidden="true">${t}</span><div class="chips">${l.map(x =>
    `<button type="button" class="chip ${x.kind === "historic" ? "h" : "f"}" role="radio" aria-checked="false" data-land="${x.id}">${esc(x.kind === "candidate" ? x.name : x.mission)} <small>${esc(x.kind === "candidate" ? x.mission.replace(/\s*\(.*\)/, "") : x.kind === "historic" ? (x.date ?? "").slice(0, 4) : x.status)}</small></button>`).join("")}</div>`).join("");
  $("land-empty").hidden = groups.some(([, l]) => l.length);
  for (const b of box.querySelectorAll<HTMLElement>(".chip")) b.onclick = () => selectLanding(b.dataset.land!);
  syncLands();
}
function syncLands() {
  const box = $("lands");
  for (const b of box.querySelectorAll(".chip")) b.setAttribute("aria-checked", String((b as HTMLElement).dataset.land === state.landingId));
  syncRoving(box, ".chip");
}
radioKeys($("lands"), ".chip", el => selectLanding(el.dataset.land!));
for (const b of document.querySelectorAll<HTMLElement>(".filter")) b.onclick = () => {
  state.landFilter = b.dataset.filter!;
  for (const x of document.querySelectorAll(".filter")) x.setAttribute("aria-pressed", String(x === b));
  renderLands();
};
$<HTMLInputElement>("land-search").oninput = (e) => { state.landQuery = (e.target as HTMLInputElement).value; renderLands(); };
renderLands();
$("land-lesson").innerHTML = `<p>${linkify(GLOSSARY["south-pole"].more ?? "")}</p><p>${linkify("Landing there is tricky. The Sun is always low, so long shadows hide boulders, and Earth bobs up and down over the horizon as the Moon nods. Planners look for high ridges that stay sunlit and can see Earth for radio.")}</p>`;
function selectLanding(id: string) {
  state.landingId = id;
  state.dest = "surface";
  state.tank = tankForDest("surface", state.tank);
  jumpToGoodDay();
  save(); refresh();
  if (!flying) focusLanding();
}

$("site-lesson").innerHTML = `<p>${linkify(SITE_LESSON.spin)}</p><p>${linkify(SITE_LESSON.latitude)}</p><p>${linkify(SITE_LESSON.range)}</p>`;
$("date-lesson").innerHTML = `<p>${linkify(SITE_LESSON.moonDecl)}</p><p>For a landing, the Sun also has to be up at the landing site, low in the morning sky so shadows show the rocks, like Apollo 11's. Sunrise comes to each place on the Moon once every 29.5 days.</p>`;
$("cal-prev").onclick = () => { state.calMonth--; if (state.calMonth < 0) { state.calMonth = 11; state.calYear--; } renderCalendar(); };
$("cal-next").onclick = () => { state.calMonth++; if (state.calMonth > 11) { state.calMonth = 0; state.calYear++; } renderCalendar(); };

// tank
const tankBox = $("tanks");
const pickTank = (n: number) => { state.tank = n; save(); refresh(); };
for (const b of tankBox.querySelectorAll<HTMLElement>(".tank")) b.onclick = () => pickTank(Number(b.dataset.tank));
radioKeys(tankBox, ".tank", el => pickTank(Number(el.dataset.tank)));

/** Move the launch date to the next good day from today (landings: Sun and Earth right at the site). */
function jumpToGoodDay() {
  const d = nextGoodDay(state.dest, site(), new Date(todayUtc), transfers, landing());
  if (d) { state.date = d; state.calYear = d.getUTCFullYear(); state.calMonth = d.getUTCMonth(); }
}

// calendar: aria-pressed buttons in a group, arrow keys move by day/week, past days disabled
const calBox = $("calendar");
function pickDay(t: number) {
  const d = new Date(t);
  if (t < todayUtc) return;
  state.date = d;
  if (d.getUTCMonth() !== state.calMonth) { state.calMonth = d.getUTCMonth(); state.calYear = d.getUTCFullYear(); }
  refresh();
}
calBox.addEventListener("keydown", (e) => {
  const cur = (document.activeElement as HTMLElement)?.dataset?.t;
  if (!cur) return;
  const step: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };
  if (!(e.key in step)) return;
  e.preventDefault();
  const t = Number(cur) + step[e.key] * 864e5;
  if (t < todayUtc) return;
  pickDay(t);
  calBox.querySelector<HTMLElement>(`[data-t="${t}"]`)?.focus();
});
function renderCalendar() {
  const s = site();
  const days = rateMonth(state.dest, s, state.calYear, state.calMonth, transfers, landing());
  const marks = calendarMarks(days, today);
  ($("cal-prev") as HTMLButtonElement).disabled = state.calYear < today.getUTCFullYear() || (state.calYear === today.getUTCFullYear() && state.calMonth <= today.getUTCMonth());
  $("cal-title").textContent = new Date(Date.UTC(state.calYear, state.calMonth, 1)).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
  const hadFocus = calBox.contains(document.activeElement);
  const first = new Date(Date.UTC(state.calYear, state.calMonth, 1)).getUTCDay();
  let html = "";
  for (let i = 0; i < first; i++) html += `<span aria-hidden="true"></span>`;
  for (const d of days) {
    const t = d.date.getTime();
    const past = t < todayUtc;
    const good = marks.good.has(t);
    const sel = t === state.date.getTime();
    const why = good ? "Best day. " : "";
    html += `<button type="button" class="day${good ? " good" : ""}" data-t="${t}" aria-pressed="${sel}"${past ? " disabled" : ""} aria-label="${esc(`${fmtDate(d.date)}. ${past ? "In the past." : why + (d.reason || "")}`)}" title="${esc(past ? "This day has passed" : d.reason)}">${good ? icon("i-check", "tick") : ""}${moonIcon(julianDay(new Date(t + 12 * 3600e3)))}<span>${d.date.getUTCDate()}</span></button>`;
  }
  calBox.innerHTML = html;
  for (const b of calBox.querySelectorAll<HTMLElement>(".day")) b.onclick = () => pickDay(Number(b.dataset.t));
  syncRoving(calBox, ".day", "aria-pressed");
  if (hadFocus) calBox.querySelector<HTMLElement>(`[aria-pressed="true"]`)?.focus();
  const why = state.dest === "surface" ? (isPolarSite(landing()) ? "the Sun and Earth are both above the horizon at the site" : earthEverVisible(landing()) ? "morning Sun and Earth in view at the site" : "morning Sun at the site; a relay carries the radio")
    : "least fuel this month";
  const note = $("cal-note");
  if (marks.allEqual) note.innerHTML = `${icon("i-check")}<span>Any day works from ${esc(s.short_name)}${["leo", "geo"].includes(state.dest) ? ": the Moon doesn't matter for this trip" : ""}.</span>`;
  else if (marks.good.size === 0) note.innerHTML = `<span class="key">${icon("i-check")}</span><span>No best days left this month. Try the next month.</span>`;
  else note.innerHTML = `<span class="key">${icon("i-check")}</span><span>Best day: ${esc(why)}.</span>`;
}

// ------------------------------------------------------------ steps (stepper; phones show one step at a time)
const isPhone = () => matchMedia("(max-width: 819px)").matches;
const stepper = $("stepper");
function setStep(n: number, scroll = true) {
  state.step = Math.max(1, Math.min(5, n));
  for (let i = 1; i <= 5; i++) document.body.classList.toggle(`step-${i}`, i === state.step);
  for (const s of document.querySelectorAll<HTMLElement>(".step")) s.classList.toggle("current", Number(s.dataset.step) === state.step);
  for (const b of stepper.querySelectorAll<HTMLElement>("button")) {
    const k = Number(b.dataset.goto);
    if (k === state.step) b.setAttribute("aria-current", "step"); else b.removeAttribute("aria-current");
    b.classList.toggle("done", k < state.step);
  }
  syncRoving(stepper, "button", "aria-current");
  // the roving helper looks for "true"; aria-current="step" needs its own pass
  for (const b of stepper.querySelectorAll<HTMLElement>("button")) b.tabIndex = Number(b.dataset.goto) === state.step ? 0 : -1;
  if (scroll) {
    const sec = $(`step-${state.step}`);
    const sc = $("planner-scroll");
    if (isPhone()) sc.scrollTop = 0;
    else sc.scrollTo({ top: sec.offsetTop - 8, behavior: reduceMotion ? "auto" : "smooth" });
  }
  $("step-next").innerHTML = `Next: ${["", "From", "When", "Ship", "Check", ""][state.step]}${icon("i-chev-r")}`;
  $("step-next").setAttribute("aria-label", `Next step: ${["", "launch site", "launch day", "spacecraft", "fuel check", ""][state.step]}`);
}
for (const b of stepper.querySelectorAll<HTMLElement>("button")) b.onclick = () => { setStep(Number(b.dataset.goto)); };
radioKeys(stepper, "button", el => setStep(Number(el.dataset.goto)));
$("step-next").onclick = () => { setStep(state.step + 1); $(`h-step-${state.step}`).setAttribute("tabindex", "-1"); $(`h-step-${state.step}`).focus(); };
$("step-back").onclick = () => { setStep(state.step - 1); $(`h-step-${state.step}`).setAttribute("tabindex", "-1"); $(`h-step-${state.step}`).focus(); };
// desktop: follow the scroll position
$("planner-scroll").addEventListener("scroll", () => {
  if (isPhone()) return;
  const top = $("planner-scroll").getBoundingClientRect().top;
  let cur = 1;
  for (const s of document.querySelectorAll<HTMLElement>(".step")) if (s.getBoundingClientRect().top - top < 120) cur = Number(s.dataset.step);
  if (cur !== state.step) setStep(cur, false);
}, { passive: true });

// ------------------------------------------------------------ refresh
let currentPlan: Plan;
function refresh() {
  const s = site();
  for (const b of destBox.querySelectorAll<HTMLElement>(".dest")) {
    const id = b.dataset.dest as DestId;
    b.setAttribute("aria-checked", String(id === state.dest));
    const u = plan(id, s, state.date, transfers, landing()).totalUnits;
    const over = u > state.tank + 1e-9;
    b.classList.toggle("over", over);
    b.querySelector(".uv")!.textContent = fmtU(u);
    (b.querySelector(".over-note") as HTMLElement).hidden = !over;
    b.setAttribute("aria-label", `${DESTINATIONS[id].name}. ${DESTINATIONS[id].tagline}. ${fmtU(u)} units${over ? ", too much for your tank" : ""}`);
  }
  syncRoving(destBox, ".dest");
  for (const b of siteBox.querySelectorAll(".chip")) b.setAttribute("aria-checked", String((b as HTMLElement).dataset.site === state.siteId));
  syncRoving(siteBox, ".chip");
  for (const b of tankBox.querySelectorAll(".tank")) b.setAttribute("aria-checked", String(Number((b as HTMLElement).dataset.tank) === state.tank));
  syncRoving(tankBox, ".tank");
  $("land-box").hidden = state.dest !== "surface";
  syncLands();
  renderLandCard();
  const d = DESTINATIONS[state.dest];
  $("dest-story").innerHTML = `${linkify(d.story)}${d.real_missions.length ? `<span class="hint">Real missions: ${esc(d.real_missions.join("; "))}</span>` : ""}`;
  const spin = toUnits(spinBonusKms(minInclination(s)));
  $("site-card").innerHTML = `<div class="spec-h"><b>${esc(s.name)}</b><span class="hint">${esc(s.country)}</span></div>
    <dl><dt>Latitude</dt><dd>${Math.abs(s.lat).toFixed(1)}° ${s.lat >= 0 ? "north" : "south"}</dd>
    <dt>Orbit tilt from here</dt><dd>${minInclination(s).toFixed(0)}°${maxInclination(s) < 180 ? `–${maxInclination(s).toFixed(0)}°` : " or more"}</dd>
    <dt>Free speed from Earth's spin</dt><dd>${fmtU(spin)} units</dd>
    <dt>Launches toward</dt><dd class="txt">${esc(s.typical_launch_direction ?? "")}</dd></dl>
    ${s.why_here ? `<p>${linkify(s.why_here)}</p>` : ""}${s.fun_fact ? `<p class="fun"><span class="label">Fun fact</span>${esc(s.fun_fact)}</p>` : ""}`;
  renderCalendar();
  currentPlan = plan(state.dest, s, state.date, transfers, landing());
  renderDateCard();
  renderSummary();
  renderChallengeBanner();
  updateSitePins();
  updateLunarPins();
  $("pin-legend").hidden = state.dest !== "surface";
  invalidate();
}

function renderLandCard() {
  const l = landing();
  const polar = needsPolarOrbit(l);
  const earth = isPolarSite(l) ? "rises and sets as the Moon nods" : earthEverVisible(l) ? "always in the sky" : "never rises: you need a relay satellite";
  const q = l.coord_quality === "exact" ? 2 : 1;
  const ns = `${Math.abs(l.lat).toFixed(q)}° ${l.lat >= 0 ? "N" : "S"}`, ew = `${Math.abs(l.lon).toFixed(q)}° ${l.lon >= 0 ? "E" : "W"}`;
  const kindTag = l.kind === "historic" ? `<span class="tagline h">History</span>` : l.kind === "candidate" ? `<span class="tagline">Candidate zone</span>` : `<span class="tagline">Planned</span>`;
  $("land-card").innerHTML = `<div class="spec-h"><b>${esc(l.name)}</b>${kindTag}</div><div class="hint">${esc(l.mission)} · ${esc(l.agency)} · ${esc(l.status)}</div>
    <dl><dt>Where</dt><dd>${ns}, ${ew}${l.coord_quality !== "exact" ? " (approx.)" : ""}</dd>
    <dt>Orbit needed</dt><dd class="txt">${polar ? "over the poles (polar)" : "over the equator"}</dd>
    <dt>Earth</dt><dd class="txt">${earth}</dd></dl>
    ${l.why_here ? `<p>${linkify(l.why_here)}</p>` : ""}${l.fun_fact ? `<p class="fun"><span class="label">Fun fact</span>${esc(l.fun_fact)}</p>` : ""}
    ${l.sources.length ? `<div class="src">${l.sources.slice(0, 3).map((u, i) => `<a href="${esc(u)}" target="_blank" rel="noopener">Source ${i + 1}${icon("i-ext")}<span class="sr-only"> (opens a new tab)</span></a>`).join("")}</div>` : ""}`;
}

function renderDateCard() {
  const p = currentPlan;
  const jdL = julianDay(new Date(p.launchDate.getTime() + 12 * 3600e3));
  let html = `<div class="spec-h"><b>${fmtDate(p.launchDate)}</b></div><dl><dt>Moon</dt><dd class="txt">${moonIcon(jdL).replace('class="moon"', 'class="moon" style="width:16px;height:16px;vertical-align:-3px"')} ${phaseName(jdL)}</dd>`;
  if (p.arrival && state.dest !== "geo") html += `<dt>Arrive</dt><dd>${fmtDate(p.arrival)}</dd>`;
  if (state.dest === "surface" && p.landingDate) html += `<dt>Land</dt><dd>${fmtDate(p.landingDate)}</dd>`;
  html += `</dl>`;
  if (p.arrival && state.dest !== "geo" && p.moonDecAtArrival !== undefined) html += `<p class="hint">The Moon will be ${Math.abs(p.moonDecAtArrival).toFixed(0)}° ${p.moonDecAtArrival >= 0 ? "north" : "south"} of the equator when you get there.</p>`;
  if (state.dest === "surface" && p.landingSunElev !== undefined) {
    const v = landingVerdict(p);
    if ((p.landingWaitDays ?? 1) > 1.2) html += `<p class="hint">You'll circle in a polar orbit for ${p.landingWaitDays!.toFixed(1)} days while the Moon turns ${esc(p.landingSite!.name)} under you.</p>`;
    html += `<p class="verdict-line ${v.ok ? "ok" : "warn"}">${icon(v.ok ? "i-check" : "i-alert")}<span>${esc(landingPlain(p))}</span></p><p class="hint">At touchdown: ${esc(v.text)}.</p>`;
  }
  $("date-card").innerHTML = html;
}

function gaugeHTML(segs: string[]): string { return segs.map(c => `<i class="${c}"></i>`).join(""); }

function renderSummary() {
  const p = currentPlan;
  const total = p.totalUnits;
  const over = total > state.tank + 1e-9;
  const why = (ph: string, title: string) => `<button type="button" class="why" data-why="${ph}" aria-label="Why: ${esc(title)}">${icon("i-why")}Why?</button>`;
  const incNote = p.incReason === "moon"
    ? `tilted ${p.inclination.toFixed(1)}° to line up with the Moon, which costs ${fmtU(toUnits(spinBonusKms(minInclination(p.site)) - spinBonusKms(p.inclination)))} extra units`
    : p.incReason === "range" ? `tilted ${p.inclination.toFixed(1)}°: ${esc(p.site.short_name)}'s safe launch directions don't allow less`
      : `tilted ${p.inclination.toFixed(1)}°, the same as your latitude`;
  const fix = over && state.tank < LANDER_TANK ? `<button type="button" class="btn fix" data-fix="tank">${icon("i-fuel")}Fix it: switch to the Lander stack</button>` : "";
  $("summary").innerHTML = `
    <div class="label free-h">Free: the big rocket pays</div>
    <ul class="burns free"><li><span class="name">Reach orbit<br><small class="hint">Orbit ${incNote}. Earth's spin gives you ${fmtU(p.launch.spinBonusUnits)} units for free.</small></span><span class="u">${fmtU(p.launch.units)}</span>${why("launch", PHASES.launch.title)}</li></ul>
    <div class="label tank-h">From your spacecraft's tank</div>
    <ul class="burns">${p.burns.length ? p.burns.map((b, i) => `<li><span class="name"><b>Burn ${i + 1}</b>${esc(b.label)}</span><span class="u">${fmtU(b.units)}</span>${why(b.phase, PHASES[b.phase as PhaseId]?.title ?? b.label)}</li>`).join("")
      : `<li><span class="name">No burns needed: you're already there!</span><span class="u">0</span></li>`}
      ${["dro", "nrho", "l1halo", "l2halo", "l4", "llo", "surface", "flyby"].includes(p.dest) ? `<li><span class="name">Coasting between burns</span><span class="u">0</span>${why("coast", PHASES.coast.title)}</li>` : ""}</ul>
    <p class="verdict-line ${over ? "bad" : "ok"}">${icon(over ? "i-alert" : "i-check")}<span>${fmtU(total)} of ${state.tank} units${over ? `: not enough fuel. ${state.tank < LANDER_TANK ? "Try the Lander stack." : "Pick a closer destination."}` : `: ${fmtU(state.tank - total)} left over`}</span></p>${fix}`;
  for (const b of $("summary").querySelectorAll<HTMLElement>("[data-why]")) b.onclick = () => showWhy(b.dataset.why as PhaseId);
  for (const b of $("summary").querySelectorAll<HTMLElement>("[data-fix]")) b.onclick = () => pickTank(LANDER_TANK);
  // dock
  const nSeg = Math.round(state.tank / 5);
  const segs: string[] = [];
  for (let i = 0; i < nSeg; i++) segs.push(over ? "over" : (i + 0.5) * 5 <= total ? "burn" : "spare");
  const g = $("dock-gauge");
  g.style.setProperty("--n", String(nSeg));
  g.innerHTML = gaugeHTML(segs);
  g.setAttribute("aria-valuemin", "0"); g.setAttribute("aria-valuemax", String(state.tank)); g.setAttribute("aria-valuenow", fmtU(Math.min(total, state.tank)));
  g.setAttribute("aria-valuetext", `${fmtU(total)} of ${state.tank} units needed${over ? ", more than the tank holds" : ""}`);
  $("dock-num").innerHTML = `${fmtU(total)} <small>/ ${state.tank} units</small>`;
  $("dock-burns").innerHTML = p.burns.map(b => `<li class="${over ? "over" : ""}">${esc(SHORT_BURN[b.phase] ?? b.label)} <b>${fmtU(b.units)}</b></li>`).join("") + (over ? "" : `<li class="spare">Spare <b>${fmtU(state.tank - total)}</b></li>`);
  const v = $("dock-verdict");
  v.className = `verdict ${over ? "bad" : "ok"}`;
  v.innerHTML = over ? `${icon("i-alert")}<span>Not enough fuel</span>${state.tank < LANDER_TANK ? `<button type="button" class="btn" id="dock-fix">Use Lander stack</button>` : ""}` : `${icon("i-check")}<span>Enough fuel${p.burns.length ? `, ${fmtU(state.tank - total)} spare` : ""}</span>`;
  $("dock-fix")?.addEventListener("click", () => pickTank(LANDER_TANK));
  const L = $("launch");
  L.classList.toggle("blocked", over);
  $("launch-text").textContent = over ? "Launch anyway" : "Launch";
  L.setAttribute("aria-describedby", "dock-verdict");
}

function showWhy(ph: PhaseId) {
  const t = PHASES[ph];
  if (!t) return;
  openModal(`<h3 id="modal-h">${esc(t.title)}: why does this cost fuel (or not)?</h3><p>${linkify(t.why)}</p>`);
}

// ------------------------------------------------------------ challenges
function renderChallengeBanner() {
  const c = state.challenge;
  const box = $("active-challenge");
  const n = CHALLENGES.filter(x => done[x.id]?.ok).length;
  $("ch-done").textContent = `${n}/${CHALLENGES.length}`;
  if (!c) { box.hidden = true; return; }
  box.hidden = false;
  box.innerHTML = `<div class="label">${icon("i-badge")}Challenge</div><b>${esc(c.title)}</b><br>${linkify(c.brief)}${c.constraints.maxUnits ? `<br>Budget: <b>${c.constraints.maxUnits} units</b> from your tank.` : ""}
    <div class="acts"><button type="button" class="btn" id="ch-hint">Hint</button><button type="button" class="btn ghost" id="ch-quit">Stop challenge</button></div>`;
  $("ch-hint").onclick = () => openModal(`<h3 id="modal-h">Hint</h3><p>${linkify(c.hint)}</p>`);
  $("ch-quit").onclick = () => { state.challenge = null; renderChallengeBanner(); $("open-challenges").focus(); };
}
function startChallenge(c: Challenge) {
  state.challenge = c;
  if (c.constraints.dest) state.dest = c.constraints.dest;
  if (c.constraints.site) state.siteId = c.constraints.site;
  state.tank = tankForDest(state.dest, state.tank);
  if (c.constraints.landingSite) state.landingId = c.constraints.landingSite;
  if (c.constraints.landingRegion && landing().region !== c.constraints.landingRegion) {
    const pick = LANDABLE.find(l => l.region === c.constraints.landingRegion && l.kind !== "historic") ?? LANDABLE.find(l => l.region === c.constraints.landingRegion);
    if (pick) state.landingId = pick.id;
  }
  if (state.dest === "surface") jumpToGoodDay();
  save();
  if (flying) stopMission(false);
  if (modal.open) { modalOpener = null; modal.close(); }
  refresh();
  setStep(1);
  if (state.dest === "surface") focusLanding();
  $("active-challenge").setAttribute("tabindex", "-1");
  $("active-challenge").focus();
}
function openChallenges() {
  openModal(`<h3 id="modal-h">Challenges</h3><p class="hint">Pick one. Your progress stays on this device.</p><ul class="ch-list">${CHALLENGES.map(c => `<li><button type="button" class="dest ch-item ${done[c.id]?.ok ? "done" : ""}" data-ch="${c.id}">${icon(done[c.id]?.ok ? "i-check" : "i-badge")}<span><b>${esc(c.title)}${done[c.id]?.ok ? '<span class="sr-only"> (done)</span>' : ""}</b><small>${esc(c.brief)}</small></span></button></li>`).join("")}</ul>`);
  for (const el of modal.querySelectorAll<HTMLElement>(".ch-item")) el.onclick = () => startChallenge(CHALLENGES.find(x => x.id === el.dataset.ch)!);
}
$("open-challenges").onclick = openChallenges;

function judgeChallenge(p: Plan, m: Mission): { ok: boolean; text: string } | null {
  const c = state.challenge;
  if (!c) return null;
  const k = c.constraints;
  const fail = (why: string) => ({ ok: false, text: `Not yet: ${why}` });
  if (m.failAt !== undefined) return fail("you ran out of fuel.");
  if (k.dest && p.dest !== k.dest) return fail(`this challenge needs ${DESTINATIONS[k.dest].name}.`);
  if (k.maxUnits !== undefined && p.totalUnits > k.maxUnits + 1e-9) return fail(`you used ${fmtU(p.totalUnits)} units; the budget is ${k.maxUnits}.`);
  if (k.site && p.site.id !== k.site) return fail("launch from the required site.");
  if (k.landingSite && p.landingSite?.id !== k.landingSite) return fail(`land at ${LANDABLE.find(l => l.id === k.landingSite)?.name ?? "the required site"}.`);
  if (k.landingRegion && p.landingSite?.region !== k.landingRegion) return fail(`pick a landing site in the ${k.landingRegion.replace("-", " ")} region.`);
  if (k.requireSunriseLanding && !(p.landingMorning && p.landingSunElev! >= 5 && p.landingSunElev! <= 20)) return fail("the Sun wasn't low in the morning sky at the landing site. Try a different day (look for the check marks).");
  if (k.requireLitLanding && !landingVerdict(p).ok) return fail(`${landingVerdict(p).text}. Try a launch day with a check mark.`);
  if (k.compareSites) {
    const rec = (done[c.id] ??= {});
    rec.sites = Array.from(new Set([...(rec.sites ?? []), p.site.id]));
    if (c.id === "cheapest-geo") {
      const best = SITES.map(s => ({ s, u: plan("geo", s, p.launchDate, transfers).totalUnits })).sort((a, b) => a.u - b.u)[0];
      if (best.s.id !== p.site.id) return fail(`${p.site.short_name} used ${fmtU(p.totalUnits)} units. Another site does better.`);
    } else {
      const lats = rec.sites.map(id => Math.abs(SITES.find(s => s.id === id)!.lat));
      if (rec.sites.length < 2 || Math.max(...lats) - Math.min(...lats) < 10) {
        localStorage.setItem("cislunar-challenges", JSON.stringify(done));
        return { ok: false, text: `Logged ${p.site.short_name}: ${fmtU(p.totalUnits)} units. Now fly the same trip from a site at a very different latitude.` };
      }
    }
  }
  return { ok: true, text: c.success };
}

// ------------------------------------------------------------ scene
const stage = $("stage");
const coarse = matchMedia("(pointer: coarse)").matches;
const renderer = new THREE.WebGLRenderer({ antialias: true, logarithmicDepthBuffer: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, coarse ? 1.5 : 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.domElement.setAttribute("role", "img");
renderer.domElement.setAttribute("aria-label", "Earth, the Moon and launch sites, turning in 3D. Use the lists in the planner to choose.");
stage.prepend(renderer.domElement);
const labels = new CSS2DRenderer();
Object.assign(labels.domElement.style, { position: "absolute", inset: "0", pointerEvents: "none", zIndex: "1" });
labels.domElement.classList.add("labels-layer");
labels.domElement.setAttribute("aria-hidden", "true");
stage.insertBefore(labels.domElement, renderer.domElement.nextSibling);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x04060a);
const camera = new THREE.PerspectiveCamera(42, 1, 0.01, 5e6);
camera.up.set(0, 0, 1);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
let dirty = true;
const invalidate = () => { dirty = true; };
controls.addEventListener("change", invalidate);
let userAimUntil = 0; // after the user drags, auto camera keeps their viewing angle for a while
controls.addEventListener("start", () => { userAimUntil = performance.now() + 8000; });
const K = 1000; // scene unit = 1000 km
const v3 = (p: V) => new THREE.Vector3(p[0] / K, p[1] / K, p[2] / K);

// stars
{
  const mk = (n: number, size: number) => {
    const g = new THREE.BufferGeometry();
    const a = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { const v = new THREE.Vector3().randomDirection().multiplyScalar(2e5); a.set([v.x, v.y, v.z], i * 3); }
    g.setAttribute("position", new THREE.BufferAttribute(a, 3));
    scene.add(new THREE.Points(g, new THREE.PointsMaterial({ color: 0x9aa6b8, size, sizeAttenuation: false })));
  };
  mk(2400, 1.2); mk(120, 2);
}
const sunLight = new THREE.DirectionalLight(0xffffff, 2.6);
const ambient = new THREE.AmbientLight(0x8090a8, 0.45);
const earthshine = new THREE.HemisphereLight(0x6fb6ff, 0x000000, 0.25);
scene.add(sunLight, sunLight.target, ambient, earthshine);

const tex = new THREE.TextureLoader();
const earthTex = tex.load(matchMedia("(max-width: 820px)").matches ? "/tex/earth-1k.webp" : "/tex/earth.webp", invalidate); earthTex.colorSpace = THREE.SRGBColorSpace; earthTex.anisotropy = 4;
const moonTex = tex.load("/tex/moon.webp", invalidate); moonTex.colorSpace = THREE.SRGBColorSpace;
const earth = new THREE.Mesh(new THREE.SphereGeometry(6.378137, 96, 48), new THREE.MeshPhongMaterial({ map: earthTex, shininess: 6, specular: 0x222233 }));
earth.matrixAutoUpdate = false;
scene.add(earth);
const atmo = new THREE.Mesh(new THREE.SphereGeometry(6.378137 * 1.025, 64, 32), new THREE.MeshBasicMaterial({ color: 0x6fb6ff, transparent: true, opacity: 0.10, side: THREE.BackSide }));
scene.add(atmo);
const moon = new THREE.Mesh(new THREE.SphereGeometry(1.7374, 64, 32), new THREE.MeshLambertMaterial({ map: moonTex }));
moon.matrixAutoUpdate = false;
scene.add(moon);

function label(text: string, cls = ""): CSS2DObject {
  const d = document.createElement("div");
  d.className = `label3d ${cls}`;
  d.textContent = text;
  return new CSS2DObject(d);
}
const earthLabel = label("Earth", "body"); scene.add(earthLabel);
const moonLabel = label("Moon", "body"); scene.add(moonLabel);

const HERITAGE = 0xf2c46d, TRACE = 0x7ad4ff, WRECK = 0x7a828f, INK = 0xf3f5f8, IGNITE = 0xff6a2b;
// launch-site pins (children of the Earth mesh, in its local frame)
const pinGroup = new THREE.Group();
earth.add(pinGroup);
const pins = new Map<string, { mesh: THREE.Mesh; lab: CSS2DObject }>();
for (const s of SITES) {
  const la = (s.lat * Math.PI) / 180, lo = (s.lon * Math.PI) / 180;
  const p = new THREE.Vector3(Math.cos(la) * Math.cos(lo), Math.sin(la), -Math.cos(la) * Math.sin(lo)).multiplyScalar(6.4);
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.07, 12, 8), new THREE.MeshBasicMaterial({ color: HERITAGE }));
  mesh.position.copy(p);
  const lab = label(s.short_name, "site");
  lab.element.onclick = () => selectSite(s.id);
  mesh.add(lab);
  pinGroup.add(mesh);
  pins.set(s.id, { mesh, lab });
}
function updateSitePins() {
  for (const [id, p] of pins) {
    const on = id === state.siteId;
    (p.mesh.material as THREE.MeshBasicMaterial).color.set(on ? INK : HERITAGE);
    p.mesh.scale.setScalar(on ? 1.8 : 1);
    p.lab.element.classList.toggle("on", on);
  }
}

// landing-site pins on the Moon (children of the Moon mesh: local x = toward Earth/0° lon, y = north, z = 90° west)
const lunarPinGroup = new THREE.Group();
moon.add(lunarPinGroup);
const lunarLocal = (lat: number, lon: number, r = 1.7374) => {
  const la = (lat * Math.PI) / 180, lo = (lon * Math.PI) / 180;
  return new THREE.Vector3(Math.cos(la) * Math.cos(lo), Math.sin(la), -Math.cos(la) * Math.sin(lo)).multiplyScalar(r);
};
const pinColor = (l: LunarSite) => l.kind === "historic" ? HERITAGE : l.kind === "crash" ? WRECK : TRACE;
const lunarPins = new Map<string, { mesh: THREE.Mesh; lab: CSS2DObject; site: LunarSite }>();
const ringGeo = new THREE.RingGeometry(0.012, 0.02, 16);
for (const l of LUNAR) {
  const crash = l.kind === "crash";
  const mesh = crash
    ? new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: WRECK, side: THREE.DoubleSide }))
    : new THREE.Mesh(new THREE.SphereGeometry(0.018, 10, 8), new THREE.MeshBasicMaterial({ color: pinColor(l) }));
  mesh.position.copy(lunarLocal(l.lat, l.lon, 1.7374 * 1.003));
  if (crash) mesh.lookAt(mesh.position.clone().multiplyScalar(2));
  const lab = label(l.kind === "candidate" ? l.name : l.mission, `lunar ${l.kind === "historic" || crash ? "" : "future"}`);
  if (!crash) lab.element.onclick = () => selectLanding(l.id);
  mesh.add(lab);
  lunarPinGroup.add(mesh);
  lunarPins.set(l.id, { mesh, lab, site: l });
}
const inPoleCluster = (l: LunarSite) => l.region === "south-pole" || l.lat < -65;
const nPolar = LANDABLE.filter(inPoleCluster).length;
const clusterLab = label(`South pole · ${nPolar} sites`, "cluster");
clusterLab.position.copy(lunarLocal(-90, 0, 1.7374 * 1.02));
clusterLab.element.onclick = () => focusLunarPoint(-89.5, 0, 0.9);
lunarPinGroup.add(clusterLab);
function updateLunarPins() {
  for (const [id, p] of lunarPins) {
    const on = id === state.landingId && state.dest === "surface";
    (p.mesh.material as THREE.MeshBasicMaterial).color.set(on ? INK : pinColor(p.site));
    p.lab.element.classList.toggle("on", on);
  }
}
const _w = new THREE.Vector3(), _mc = new THREE.Vector3();
function updateLunarLabels() {
  moon.updateMatrixWorld();
  _mc.setFromMatrixPosition(moon.matrixWorld);
  const camToMoon = camera.position.distanceTo(_mc);
  const near = camToMoon < 14;
  moonLabel.element.style.visibility = camToMoon < 9 ? "hidden" : "visible";
  for (const [id, p] of lunarPins) {
    const on = id === state.landingId && state.dest === "surface";
    p.mesh.getWorldPosition(_w);
    p.mesh.scale.setScalar(Math.max(0.15, Math.min(3, camera.position.distanceTo(_w) * 0.35)) * (on ? 1.8 : 1));
    const facing = _w.clone().sub(_mc).normalize().dot(camera.position.clone().sub(_w).normalize()) > 0.02;
    const closeUp = camera.position.distanceTo(_w) < 1.6;
    let show = facing && (on || (!flying && near && state.dest === "surface" && (inPoleCluster(p.site) || p.site.kind === "crash" ? closeUp : true)));
    if (flying && (!on || camToMoon > 25)) show = false;
    p.mesh.visible = facing && (!flying || on);
    p.lab.element.style.visibility = show ? "visible" : "hidden";
  }
  clusterLab.getWorldPosition(_w);
  const cf = _w.clone().sub(_mc).normalize().dot(camera.position.clone().sub(_w).normalize()) > -0.1;
  clusterLab.element.style.visibility = !flying && near && state.dest === "surface" && cf && camera.position.distanceTo(_w) > 1.6 && nPolar > 0 ? "visible" : "hidden";
}
function focusLunarPoint(lat: number, lon: number, dist: number) {
  moon.updateMatrixWorld();
  const c = new THREE.Vector3().setFromMatrixPosition(moon.matrixWorld);
  const pt = lunarLocal(lat, lon).applyMatrix4(moon.matrixWorld);
  const out = pt.clone().sub(c).normalize();
  // near the poles, tilt the view toward the Earth-facing side so the horizon shows (the Sun skims it there)
  const toEarth = new THREE.Vector3().setFromMatrixColumn(moon.matrixWorld, 0).normalize();
  const tangent = toEarth.sub(out.clone().multiplyScalar(toEarth.dot(out)));
  const view = Math.abs(lat) > 60 && tangent.length() > 1e-3 ? out.clone().add(tangent.normalize().multiplyScalar(1.0)).normalize() : out;
  camTo(pt, pt.clone().add(view.multiplyScalar(dist + 1.2)), 1.4);
}
function focusLanding() {
  const l = landing();
  focusLunarPoint(l.lat, l.lon, Math.abs(l.lat) > 80 ? 0.8 : 3.5);
}
// tap the Moon to pick the nearest landing site
{
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  let down: [number, number] | null = null;
  renderer.domElement.addEventListener("pointerdown", (e) => { down = [e.clientX, e.clientY]; });
  renderer.domElement.addEventListener("pointerup", (e) => {
    if (flying || !down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 6) return;
    const r = renderer.domElement.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const hit = ray.intersectObject(moon, false)[0];
    if (!hit) return;
    const loc = moon.worldToLocal(hit.point.clone()).normalize();
    const lat = Math.asin(loc.y), lon = Math.atan2(-loc.z, loc.x);
    let best: LunarSite | null = null, bd = 0.12; // ~7 deg
    for (const l of LANDABLE) {
      const la = (l.lat * Math.PI) / 180, lo = (l.lon * Math.PI) / 180;
      const d = Math.acos(Math.min(1, Math.sin(lat) * Math.sin(la) + Math.cos(lat) * Math.cos(la) * Math.cos(lon - lo)));
      if (d < bd) { bd = d; best = l; }
    }
    if (best) selectLanding(best.id);
  });
}

// spacecraft
const craftDot = new THREE.Points(new THREE.BufferGeometry().setAttribute("position", new THREE.BufferAttribute(new Float32Array(3), 3)),
  new THREE.PointsMaterial({ color: INK, size: 7, sizeAttenuation: false }));
// round, soft engine glow (a plain points sprite is a square)
const glowTex = (() => {
  const c = document.createElement("canvas"); c.width = c.height = 64;
  const g = c.getContext("2d")!;
  const r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  r.addColorStop(0, "rgba(255,255,255,1)"); r.addColorStop(0.35, "rgba(255,255,255,.8)"); r.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = r; g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
})();
const flame = new THREE.Points(new THREE.BufferGeometry().setAttribute("position", new THREE.BufferAttribute(new Float32Array(3), 3)),
  new THREE.PointsMaterial({ color: IGNITE, size: 26, map: glowTex, sizeAttenuation: false, transparent: true, opacity: 0.0, depthWrite: false }));
const craftLabel = label("You", "craft");
craftDot.add(craftLabel);
scene.add(craftDot, flame);
craftDot.visible = flame.visible = false;

// paths: flown = white, ahead = dimmer dashed, burns = orange, Moon's orbit = dotted grey
const pathFuture = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineDashedMaterial({ color: INK, transparent: true, opacity: 0.5, dashSize: 2.5, gapSize: 2 }));
// flown path and burn stretches are fat lines (2px / 3px); LineBasicMaterial is always 1px
const doneMat = new LineMaterial({ color: INK, linewidth: 2 });
const burnMat = new LineMaterial({ color: IGNITE, linewidth: 3 });
const pathDone = new Line2(new LineGeometry(), doneMat);
pathDone.frustumCulled = false;
pathDone.visible = false;
const moonPath = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineDashedMaterial({ color: 0x3b4556, dashSize: 1.5, gapSize: 5 }));
const burnGroup = new THREE.Group();
scene.add(pathFuture, pathDone, moonPath, burnGroup);
let burnLines: { line: Line2; i0: number; i1: number }[] = [];
/** Copy points (from index i0) into a fat line's segment buffer in place, e.g. after the Moon view rotates the path. */
function syncLine2(g: LineGeometry, pts: Float32Array, i0: number) {
  const data = (g.attributes.instanceStart as THREE.InterleavedBufferAttribute).data;
  const buf = data.array as Float32Array;
  const n = buf.length / 6;
  for (let i = 0; i < n; i++) { const s = (i0 + i) * 3; buf.set(pts.subarray(s, s + 6), i * 6); }
  data.needsUpdate = true;
}

// Earth / Moon orientation
function setEarth(gmst: number, jd: number) {
  const g = (gmst * Math.PI) / 180;
  const ec = (v: V) => new THREE.Vector3(...(equatorialToEcliptic(v, jd) as V));
  const xL = ec([Math.cos(g), Math.sin(g), 0]);           // Greenwich meridian
  const yL = ec([0, 0, 1]);                                 // north pole
  const zL = ec([Math.sin(g), -Math.cos(g), 0]);          // = -(90 deg east)
  earth.matrix.makeBasis(xL, yL, zL);
  earth.matrixWorldNeedsUpdate = true;
}
function setMoon(pos: V, axes: { x: V; z: V }) {
  const x = new THREE.Vector3(...axes.x).normalize();
  const z = new THREE.Vector3(...axes.z).normalize();
  const y = new THREE.Vector3().crossVectors(z, x).normalize(); // 90 deg east on the Moon
  moon.matrix.makeBasis(x, z, y.clone().negate());
  moon.matrix.setPosition(v3(pos));
  moon.matrixWorldNeedsUpdate = true;
  moonLabel.position.copy(v3(pos));
}

const gmstNow = () => gmstDeg(julianDay(new Date()));
const moonEclNow = (): V => { const jd = julianDay(new Date()); const d = moonDirEcliptic(jd); const r = moonEcliptic(jd).distKm; return [d[0] * r, d[1] * r, d[2] * r]; };
const sunNow = () => sunDirEcliptic(julianDay(new Date())) as V;
// idle view: today's sky with sites
function idleScene() {
  const jd = julianDay(new Date());
  setEarth(gmstNow(), jd);
  const m = moonEclNow();
  setMoon(m, { x: [-m[0], -m[1], -m[2]], z: [0, 0, 1] });
  const s = sunNow();
  sunLight.position.set(s[0] * 1e4, s[1] * 1e4, s[2] * 1e4);
  invalidate();
}

function focusSite() {
  const pin = pins.get(state.siteId);
  if (!pin) return;
  earth.updateMatrixWorld(true);
  const p = pin.mesh.getWorldPosition(new THREE.Vector3());
  camTo(new THREE.Vector3(0, 0, 0), p.clone().normalize().multiplyScalar(24), 1.2);
}

// smooth camera moves (instant with reduce motion)
let camAnim: { from: THREE.Vector3; to: THREE.Vector3; tFrom: THREE.Vector3; tTo: THREE.Vector3; t: number; dur: number } | null = null;
function camTo(target: THREE.Vector3, pos: THREE.Vector3, dur = 1) {
  camAnim = { from: camera.position.clone(), to: pos, tFrom: controls.target.clone(), tTo: target, t: 0, dur: reduceMotion ? 1e-6 : dur };
  invalidate();
}

// ------------------------------------------------------------ flight
let mission: Mission | null = null;
let flying = false;
let playing = true;
let wall = 0, W = 1;
let speedIdx = 1;
const SPEEDS = [0.5, 1, 2, 4];
let autoCam = true;
let lastPhaseKey = "";
let pathTimes: number[] = [];
let pathInert: Float32Array = new Float32Array(0);
type ViewMode = "auto" | "space" | "moon";
let viewMode: ViewMode = "auto";
let lastRotKey = NaN;
let quickRun = false;
let coachDone = new Set<string>();
let fitK = 1, aspK = 1;

$("launch").onclick = () => { void startMission(); };
$("back-plan").onclick = () => stopMission();
for (const b of $("view-seg").querySelectorAll<HTMLElement>("button")) b.onclick = () => { viewMode = b.dataset.view as ViewMode; lastRotKey = NaN; };
$("cam-auto").onclick = () => { autoCam = !autoCam; $("cam-auto").classList.toggle("on", autoCam); $("cam-auto").setAttribute("aria-pressed", String(autoCam)); };
$("play").onclick = () => togglePlay();
function togglePlay() {
  if (!mission) return;
  if (wall >= endWall() - 1e-6) { replay(); return; }
  playing = !playing; syncPlay();
}
const endWall = () => mission ? missionToWall(mission.segments, mission.failAt ?? mission.end) : 1;
function setSpeed(i: number) {
  speedIdx = i;
  for (const b of $("speed-seg").querySelectorAll<HTMLElement>("button")) b.setAttribute("aria-pressed", String(Number(b.dataset.speed) === i));
}
for (const b of $("speed-seg").querySelectorAll<HTMLElement>("button")) b.onclick = () => setSpeed(Number(b.dataset.speed));
const scrub = $<HTMLInputElement>("scrub");
scrub.oninput = () => { wall = (Number(scrub.value) / 1000) * W; hideEnd(); };
function jumpEvent(dir: number) {
  if (!mission) return;
  const ws = mission.events.map(e => missionToWall(mission!.segments, e.t)).filter(w => w <= endWall() + 1e-6);
  const target = dir > 0 ? ws.find(w => w > wall + 0.05) : [...ws].reverse().find(w => w < wall - 0.3);
  if (target !== undefined) { wall = target; hideEnd(); }
}
addEventListener("keydown", (e) => {
  const tgt = e.target as HTMLElement;
  if (modal.open || ($("briefing") as HTMLDialogElement).open || e.metaKey || e.ctrlKey || e.altKey) return;
  const typing = !!tgt.closest("input[type=search], input[type=text]");
  if (typing) return;
  if (e.key === "?" ) { e.preventDefault(); openHelp(); return; }
  if (!flying) return;
  if (e.key === " " && !tgt.closest("button, input, a, summary")) { e.preventDefault(); togglePlay(); }
  else if ((e.key === "ArrowRight" || e.key === "ArrowLeft") && !tgt.closest("input, .seg, .dest, .chip, .calendar")) { e.preventDefault(); jumpEvent(e.key === "ArrowRight" ? 1 : -1); }
  else if (e.key === "1" || e.key === "2" || e.key === "3") setSpeed(Number(e.key));
  else if (e.key === "p" || e.key === "P") stopMission();
  else if (e.key === "w" || e.key === "W") $("cap-why").click();
});
function syncPlay() {
  const b = $("play");
  b.innerHTML = `<svg aria-hidden="true"><use href="#${playing ? "i-pause" : "i-play"}"/></svg>`;
  b.setAttribute("aria-label", playing ? "Pause" : wall >= endWall() - 1e-6 ? "Play again" : "Play");
}

const PHASE_NAMES: Record<string, string> = { launch: "Launch", parking: "Orbit", coast: "Coast", approach: "Arrive", orbit: "Orbit", wait: "Wait", descent: "Descent", landed: "Landed", flyby: "Flyby", return: "Home", gto: "Climb", geo: "GEO" };
let stripParts: { name: string; w0: number; w1: number }[] = [];
let stripBurns: { w: number; el: HTMLElement }[] = [];
function buildStrip(m: Mission) {
  stripParts = [];
  let w = 0;
  for (const s of m.segments) {
    const w1 = w + s.wall;
    const name = PHASE_NAMES[s.name] ?? s.name;
    const last = stripParts[stripParts.length - 1];
    if (last && last.name === name) last.w1 = w1; else stripParts.push({ name, w0: w, w1 });
    w = w1;
  }
  const eW = endWall();
  stripParts = stripParts.filter(p => p.w0 < eW - 1e-6).map(p => ({ ...p, w1: Math.min(p.w1, eW) }));
  const box = $("phases");
  box.innerHTML = stripParts.map(p => `<div style="--w:${(p.w1 - p.w0).toFixed(3)}"><i></i><span>${esc(p.name)}</span></div>`).join("")
    + m.events.filter(e => e.units > 0 && e.t <= (m.failAt ?? m.end)).map(e => `<b class="bm" data-w="${missionToWall(m.segments, e.t)}" title="${esc(e.label)}"></b>`).join("")
    + `<b class="thumb"></b>`;
  stripBurns = [...box.querySelectorAll<HTMLElement>(".bm")].map(el => ({ w: Number(el.dataset.w), el }));
  for (const b of stripBurns) b.el.style.left = `${(b.w / eW) * 100}%`;
}
function updateStrip() {
  const eW = endWall();
  const divs = $("phases").querySelectorAll<HTMLElement>("div");
  stripParts.forEach((p, i) => {
    const d = divs[i];
    const isNow = wall >= p.w0 && (wall < p.w1 || i === stripParts.length - 1);
    d.className = wall >= p.w1 && !isNow ? "done" : isNow ? "now" : "";
    if (isNow) d.style.setProperty("--p", `${Math.min(100, ((wall - p.w0) / Math.max(1e-6, p.w1 - p.w0)) * 100)}%`);
  });
  for (const b of stripBurns) b.el.classList.toggle("done", wall >= b.w - 1e-6);
  ($("phases").querySelector(".thumb") as HTMLElement).style.left = `${Math.min(100, (wall / eW) * 100)}%`;
}

async function startMission() {
  const p = currentPlan;
  const key = p.transferKey ?? p.dest;
  const tr = transfers[key] ? await loadFlight(key, transfers) : undefined;
  mission = buildMission(p, tr, SYS, state.tank);
  flying = true;
  closePopover();
  document.body.classList.add("flying");
  document.body.classList.remove("ended");
  $("hud").hidden = false;
  $("endcard").hidden = true;
  pinGroup.visible = false;
  W = totalWall(mission.segments);
  wall = 0; playing = true; lastPhaseKey = ""; lastEventIdx = -1;
  focusSegName = ""; lastSeg = null; prevFocus = null; lastAngle = null;
  if (reduceMotion && !quickRun) setSpeed(1);
  syncPlay();
  // sample the path evenly in playback time so fast near-Earth parts stay smooth
  const N = 5000;
  pathTimes = [];
  const pts: number[] = [];
  for (let k = 0; k <= N; k++) {
    const t = wallToMission(mission.segments, (W * k) / N);
    pathTimes.push(t);
    const q = mission.craft(t);
    pts.push(q[0] / K, q[1] / K, q[2] / K);
  }
  pathInert = new Float32Array(pts);
  const arr = new Float32Array(pts);
  lastRotKey = NaN;
  $("view-seg").hidden = !MOON_DESTS.includes(p.dest) && p.dest !== "flyby";
  pathFuture.geometry.dispose(); pathDone.geometry.dispose();
  const attr = new THREE.BufferAttribute(arr, 3);
  attr.setUsage(THREE.DynamicDrawUsage);
  pathFuture.geometry = new THREE.BufferGeometry().setAttribute("position", attr);
  pathFuture.computeLineDistances();
  const dg = new LineGeometry();
  dg.setPositions(arr);
  dg.instanceCount = 0;
  pathDone.geometry = dg;
  pathDone.visible = true;
  // orange stretches where the engine fires
  for (const b of burnLines) { burnGroup.remove(b.line); b.line.geometry.dispose(); }
  burnLines = [];
  const m = mission;
  m.events.forEach((e, i) => {
    if (e.units <= 0) return;
    const we = missionToWall(m.segments, e.t);
    const wEnd = e.phase === "descent" && m.events[i + 1] ? missionToWall(m.segments, m.events[i + 1].t) : we + 0.25;
    const i0 = Math.max(0, Math.floor(((we - 0.1) / W) * N)), i1 = Math.min(N, Math.ceil((wEnd / W) * N));
    const g = new LineGeometry();
    g.setPositions(arr.slice(i0 * 3, (i1 + 1) * 3));
    g.instanceCount = 0;
    const line = new Line2(g, burnMat);
    line.frustumCulled = false;
    burnGroup.add(line);
    burnLines.push({ line, i0, i1 });
  });
  const mp: number[] = [];
  for (let k = 0; k <= 400; k++) { const q = m.moon((m.end * k) / 400); mp.push(q[0] / K, q[1] / K, q[2] / K); }
  moonPath.geometry.dispose();
  moonPath.geometry = new THREE.BufferGeometry().setAttribute("position", new THREE.BufferAttribute(new Float32Array(mp), 3));
  moonPath.computeLineDistances();
  moonPath.visible = !["leo", "geo"].includes(p.dest);
  craftDot.visible = flame.visible = true;
  buildStrip(m);
  onResize();
  $("play").focus();
  live(`Launch! Flying to ${p.dest === "surface" && p.landingSite ? p.landingSite.name : DESTINATIONS[p.dest].name}. Space bar pauses.`);
}

function stopMission(refocus = true) {
  flying = false;
  mission = null;
  quickRun = false;
  hideCoach();
  document.body.classList.remove("flying", "ended");
  $("hud").hidden = true;
  pinGroup.visible = true;
  craftDot.visible = flame.visible = false;
  pathFuture.geometry.setDrawRange(0, 0); pathDone.visible = false;
  for (const b of burnLines) b.line.visible = false;
  moonPath.visible = false;
  idleScene();
  onResize();
  if (state.dest === "surface") focusLanding(); else focusSite();
  refresh();
  if (refocus) $("launch").focus();
}

function replay() { wall = 0; playing = true; lastPhaseKey = ""; lastEventIdx = -1; hideEnd(); syncPlay(); $("play").focus(); }
function hideEnd() {
  if ($("endcard").hidden) return;
  $("endcard").hidden = true;
  document.body.classList.remove("ended");
  lastPhaseKey = "";
  layoutHud();
}

function fuelAt(t: number): number {
  return state.tank - mission!.events.filter(e => e.t <= t).reduce((s, e) => s + e.units, 0);
}
function phaseIdx(t: number) {
  const evs = mission!.events;
  let i = 0;
  for (let k = 0; k < evs.length; k++) if (evs[k].t <= t + 1e-6) i = k;
  return i;
}

let bannerTimer = 0;
function burnBanner(text: string) {
  const el = $("burn-banner");
  $("burn-text").textContent = text;
  el.hidden = false;
  live(text);
  clearTimeout(bannerTimer);
  bannerTimer = window.setTimeout(() => { el.hidden = true; }, 1800);
}

const fmtMETParts = (sec: number) => {
  const d = Math.floor(sec / 86400), h = Math.floor((sec % 86400) / 3600), m = Math.floor((sec % 3600) / 60);
  return { d, h, m };
};
function fmtMET(sec: number) {
  const { d, h, m } = fmtMETParts(sec);
  return `${d > 0 ? d + "d " : ""}${String(h).padStart(2, "0")}h ${String(m).padStart(2, "0")}m`;
}
function metHTML(sec: number) {
  const { d, h, m } = fmtMETParts(sec);
  return `${d}<span>d</span>${String(h).padStart(2, "0")}<span>h</span>${String(m).padStart(2, "0")}<span>m</span>`;
}

function patchSVG(top: string, bottom: string, glyph: string): string {
  const id = `p${Math.random().toString(36).slice(2, 7)}`;
  return `<svg class="patch" viewBox="0 0 220 220" aria-hidden="true">
    <defs><path id="${id}t" d="M30 110 A80 80 0 0 1 190 110"/><path id="${id}b" d="M22 110 A88 88 0 0 0 198 110"/></defs>
    <circle cx="110" cy="110" r="106" fill="#0A0D12" stroke="#F3F5F8" stroke-width="2"/>
    <circle cx="110" cy="110" r="66" fill="#12161D" stroke="#646F82" stroke-width="1"/>
    <text font-family="Saira Variable, sans-serif" font-weight="700" font-size="${top.length > 18 ? 12 : 15}" letter-spacing="3" fill="#F3F5F8"><textPath href="#${id}t" startOffset="50%" text-anchor="middle">${esc(top.toUpperCase())}</textPath></text>
    <text font-family="Saira Variable, sans-serif" font-weight="600" font-size="12" letter-spacing="2.4" fill="#B6BECA"><textPath href="#${id}b" startOffset="50%" text-anchor="middle">${esc(bottom.toUpperCase())}</textPath></text>
    <use href="#${glyph}" x="70" y="68" width="80" height="80" style="color:#F3F5F8"/>
    <circle cx="16" cy="110" r="2.5" fill="#F3F5F8"/><circle cx="204" cy="110" r="2.5" fill="#F3F5F8"/>
  </svg>`;
}

function showEndCard(t: number, failed: boolean, key: string, vars: Record<string, string>) {
  const m = mission!, p = currentPlan;
  const card = $("endcard");
  const used = state.tank - fuelAt(t);
  let html: string;
  if (failed) {
    const need = p.burns.find(b => b.phase === m.failPhase);
    const left = fuelAt(t);
    const what: Record<string, string> = {
      tli: "leave Earth orbit", loi: "brake into orbit around the Moon. The spacecraft would sail right past it",
      insert: "match the target orbit, so the spacecraft drifts away", descent: "land. The crew would have to stay in orbit",
      gto: "start the climb to GEO", geo: "finish at GEO",
    };
    card.classList.add("failed");
    html = `${patchSVG("Out of fuel", fmtDate(m.liftoff).replace(/^\w+, /, ""), DESTINATIONS[p.dest].glyph)}<div>
      <div class="label end-k">${icon("i-alert")}Out of fuel</div>
      <h2 class="hero" id="end-h">Not enough fuel</h2>
      <p>This burn needs <b>${fmtU(need?.units ?? 0)} units</b> but only <b>${fmtU(left)}</b> are left, so you can't ${what[m.failPhase ?? ""] ?? "finish"}. ${state.tank < LANDER_TANK ? "Try again with the Lander stack, or pick a closer destination." : "Pick a destination that needs less fuel."}</p>
      <div class="stats"><div><div class="label">Fuel used</div><div class="num">${fmtU(used)}<small>units</small></div></div><div><div class="label">Flight time</div><div class="num">${fmtMET(t)}</div></div><div><div class="label">Needed</div><div class="num">${fmtU(p.totalUnits)}<small>units</small></div></div></div>
      <div class="actions">${state.tank < LANDER_TANK ? `<button type="button" class="btn solid" id="r-fix">${icon("i-fuel")}Fly again with the Lander stack</button>` : ""}<button type="button" class="btn${state.tank < LANDER_TANK ? "" : " solid"}" id="r-plan">${icon("i-edit")}Change the plan</button></div></div>`;
  } else {
    card.classList.remove("failed");
    const ch = judgeChallenge(p, m);
    if (ch?.ok && state.challenge) { done[state.challenge.id] = { ...(done[state.challenge.id] ?? {}), ok: true }; localStorage.setItem("cislunar-challenges", JSON.stringify(done)); renderChallengeBanner(); }
    const endPh = PHASES[key as PhaseId] ?? PHASES.arrived;
    const where = p.dest === "surface" && p.landingSite ? p.landingSite.name : DESTINATIONS[p.dest].name;
    const title = p.dest === "surface" && p.landingSite ? `Landed at ${where}` : endPh === PHASES.arrived ? `Arrived: ${where}` : endPh.title;
    const handoff = quickRun
      ? `<p><b>Your turn.</b> Plan your own trip: pick where to go, where to launch from and which day. Or try a challenge.</p>
         <div class="actions"><button type="button" class="btn solid" id="r-plan">${icon("i-edit")}Your turn: plan a mission</button><button type="button" class="btn" id="r-challenge">${icon("i-badge")}Try a challenge</button><button type="button" class="btn" id="r-replay">${icon("i-replay")}Watch again</button></div>`
      : `<div class="actions"><button type="button" class="btn solid" id="r-plan">${icon("i-edit")}Plan another mission</button><button type="button" class="btn" id="r-replay">${icon("i-replay")}Watch again</button></div>`;
    html = `${patchSVG(where, `${fmtDate(m.liftoff).replace(/^\w+, /, "")} · Sicklunar`, DESTINATIONS[p.dest].glyph)}<div>
      <div class="label end-k">${icon("i-check")}Mission complete</div>
      <h2 class="hero" id="end-h">${esc(title)}</h2>
      <p>${linkify(fillPlaceholders(endPh.caption, vars))}</p>
      <div class="stats"><div><div class="label">Fuel used</div><div class="num">${fmtU(p.totalUnits)}<small>units</small></div></div><div><div class="label">Flight time</div><div class="num">${fmtMET(m.end)}</div></div><div><div class="label">Spare</div><div class="num">${fmtU(state.tank - p.totalUnits)}<small>units</small></div></div></div>
      ${ch ? `<div class="challenge ${ch.ok ? "ok" : "warn"}">${icon(ch.ok ? "i-check" : "i-badge")}<span>${linkify(ch.text)}</span></div>` : ""}
      ${handoff}</div>`;
  }
  card.innerHTML = html;
  card.hidden = false;
  document.body.classList.add("ended");
  $("r-plan")?.addEventListener("click", () => stopMission());
  $("r-replay")?.addEventListener("click", replay);
  $("r-fix")?.addEventListener("click", () => { state.tank = LANDER_TANK; save(); refresh(); void startMission(); });
  $("r-challenge")?.addEventListener("click", () => { stopMission(false); openChallenges(); });
  live(`${card.querySelector("h2")?.textContent ?? ""}. ${card.querySelector("p")?.textContent ?? ""}`);
  (card.querySelector<HTMLElement>(".actions .btn"))?.focus();
  layoutHud();
}

function updateCaption(t: number) {
  const m = mission!, p = currentPlan;
  const i = phaseIdx(t);
  const ev = m.events[i];
  let key = ev.phase;
  if (key === "tli" && t > ev.t + 3600) key = "coast";
  if (key === "loi" && t > ev.t + 1800 && p.dest === "llo") key = "arrived";
  if (key === "insert" && t > ev.t + 1800) key = "arrived";
  if (key === "flyby" && t > ev.t + 10 * 3600) key = "return";
  if (key === "gto" && t > ev.t + 1800) key = "coast";
  if (key === "geo" && t > ev.t + 1800) key = "arrived";
  const end = m.failAt !== undefined ? m.failAt : m.end;
  const finished = t >= end - 1e-6;
  const failed = finished && m.failAt !== undefined;
  const stateKey = key + (finished ? "-end" : "");
  if (stateKey === lastPhaseKey) return;
  lastPhaseKey = stateKey;
  const arrive = m.info.arrival ? (m.info.arrival.getTime() - m.liftoff.getTime()) / 864e5 : m.end / 86400;
  const vars = {
    site: key === "landed" || key === "wait" ? (p.landingSite ? `${p.landingSite.name}${p.landingSite.kind === "historic" ? `, where ${p.landingSite.mission} landed` : ""}` : "the landing site") : p.site.short_name,
    dest: p.dest === "surface" && p.landingSite ? p.landingSite.name : DESTINATIONS[p.dest].name,
    wait: (p.landingWaitDays ?? 1).toFixed(1),
    units: fmtU(key === "arrived" || key === "landed" || key === "splashdown" ? p.totalUnits : (ev.units || p.burns.find(b => b.phase === key)?.units || 0)),
    days: arrive.toFixed(1),
  };
  if (finished) { showEndCard(t, failed, key, vars); return; }
  const ph = PHASES[key as PhaseId];
  if (!ph) return;
  const burnNo = ev.units > 0 && key === ev.phase ? m.events.filter(e => e.units > 0 && e.t <= ev.t).length : 0;
  $("cap-count").textContent = `Phase ${i + 1} of ${m.events.length}${burnNo ? ` · Burn ${burnNo}` : ""}`;
  $("cap-title").textContent = ph.title;
  $("cap-text").innerHTML = linkify(fillPlaceholders(ph.caption, vars));
  $("cap-why").onclick = () => showWhy(key as PhaseId);
  $("cap-why").setAttribute("aria-label", `Why: ${ph.title}`);
  live(`${ph.title}. ${fillPlaceholders(ph.caption, vars)}`);
  layoutHud();
}

/** Keep the spacecraft in the clear area between the top readouts and the bottom panels on any aspect. */
function layoutHud() {
  if (!flying) return;
  const w = stage.clientWidth, h = stage.clientHeight;
  const sr = stage.getBoundingClientRect();
  const topEl = document.querySelector(".tele") as HTMLElement;
  const botEl = !$("endcard").hidden ? $("endcard") : $("hud-bottom");
  const freeTop = Math.max(0, topEl.getBoundingClientRect().bottom - sr.top + 8);
  const freeBottom = Math.min(h, botEl.getBoundingClientRect().top - sr.top - 8);
  const freeH = Math.max(80, freeBottom - freeTop);
  const cy = freeTop + freeH / 2;
  camera.setViewOffset(w, h, 0, h / 2 - cy, w, h);
  // zoom out when the clear area is short (big panels) or the screen is narrow (portrait phones)
  fitK = Math.min(3, Math.max(1, (h * 0.8) / freeH));
  aspK = Math.min(2.2, Math.max(1, 1.5 / (w / freeH)));
  invalidate();
}

// ------------------------------------------------------------ first-run briefing + quick launch coach marks
const briefing = $<HTMLDialogElement>("briefing");
let briefStep = 1;
let briefOpener: HTMLElement | null = null;
function renderBriefing() {
  const head = (n: number) => `<div class="bh"><span class="label">Mission briefing · ${n} of 3</span><button type="button" class="linkish" data-b="skip">Skip briefing</button></div><div class="dots" aria-hidden="true">${[1, 2, 3].map(k => `<i class="${k <= n ? "on" : ""}"></i>`).join("")}</div>`;
  const choices = `<div class="choices"><button type="button" class="choice primary" data-b="quick"><b>Fly Apollo 11 now</b><small>One tap. We pick everything, just like 1969. Then we show you the controls.</small><span class="label">Quick launch · about 1 minute</span></button><button type="button" class="choice" data-b="own"><b>Plan my own mission</b><small>Pick where to go, where to launch from, which day and your fuel tank, step by step.</small><span class="label">5 steps</span></button></div>`;
  let html = "";
  if (briefStep === 1) html = `${head(1)}<h2 id="brief-h">You're the flight director.</h2><p id="brief-d">Plan a real trip to the Moon: where to go, where to launch from and which day. Then watch your spacecraft fly it.</p>${choices}<div class="bf"><span></span><button type="button" class="btn" data-b="next">Next: how a trip works${icon("i-chev-r")}</button></div>`;
  else if (briefStep === 2) html = `${head(2)}<h2 id="brief-h">Every trip has three parts.</h2><p id="brief-d">Fuel is counted in units. 1 unit = 100 m/s of speed change (360 km/h, about a race car's top speed).</p>
    <ul class="parts"><li>${icon("i-rocket")}<span><b>Launch</b>The big rocket pays. Reaching orbit costs about 93 units, and your spacecraft's tank pays none of it.</span></li>
    <li class="burn">${icon("i-burn")}<span><b>Burns</b>Your tank pays. Short engine firings change your speed: one to head for the Moon, more to brake or land.</span></li>
    <li>${icon("i-orbit")}<span><b>Coast</b>Free. The engine is off and gravity does the work.</span></li></ul>
    <div class="bf"><button type="button" class="btn" data-b="back">${icon("i-chev-l")}Back</button><button type="button" class="btn solid" data-b="next">Next${icon("i-chev-r")}</button></div>`;
  else html = `${head(3)}<h2 id="brief-h">Watch first, or plan?</h2><p id="brief-d">The planner has 5 steps: Where, From, When, Ship and Check. The orange Launch button is always at the bottom. Press Help any time to see this briefing again.</p>${choices}<div class="bf"><button type="button" class="btn" data-b="back">${icon("i-chev-l")}Back</button></div>`;
  briefing.innerHTML = html;
  for (const b of briefing.querySelectorAll<HTMLElement>("[data-b]")) b.onclick = () => briefAction(b.dataset.b!);
  (briefing.querySelector<HTMLElement>(briefStep === 2 ? "[data-b=next]" : "[data-b=quick]"))?.focus();
}
function openBriefing() {
  briefOpener = document.activeElement as HTMLElement | null;
  briefStep = 1;
  if (modal.open) modal.close();
  renderBriefing();
  if (!briefing.open) briefing.showModal();
  renderBriefing();
}
function closeBriefing() {
  localStorage.setItem("cislunar-onboarded", "1");
  if (briefing.open) briefing.close();
}
briefing.addEventListener("cancel", () => { localStorage.setItem("cislunar-onboarded", "1"); });
briefing.addEventListener("close", () => { if (!flying && briefOpener && document.contains(briefOpener)) briefOpener.focus(); });
function briefAction(a: string) {
  if (a === "next") { briefStep = Math.min(3, briefStep + 1); renderBriefing(); }
  else if (a === "back") { briefStep = Math.max(1, briefStep - 1); renderBriefing(); }
  else if (a === "skip") { closeBriefing(); }
  else if (a === "own") { briefOpener = null; closeBriefing(); setStep(1); destBox.querySelector<HTMLElement>('[aria-checked="true"]')?.focus(); }
  else if (a === "quick") { briefOpener = null; closeBriefing(); void quickLaunch(); }
}
async function quickLaunch() {
  if (flying) stopMission(false);
  state.challenge = null;
  state.dest = "surface"; state.landingId = "apollo-11"; state.siteId = "ksc"; state.tank = LANDER_TANK;
  jumpToGoodDay();
  save(); refresh();
  quickRun = true;
  coachDone = new Set();
  setSpeed(2);
  await startMission();
}
interface Coach { id: string; target: string; title: string; html: string }
const COACH_START: Coach[] = [
  { id: "play", target: "#play", title: "Pause and play", html: "Press this button or the <kbd>Space</kbd> bar to pause and play." },
  { id: "strip", target: ".phases-wrap", title: "The timeline", html: "Each part of the trip has a name. Orange diamonds are burns. Drag here, or use the arrow keys, to jump around." },
  { id: "why", target: "#cap-why", title: "Why?", html: "Every step explains itself. Tap Why? to learn why it costs fuel, or why it's free." },
];
const COACH_BURN: Coach[] = [
  { id: "fuel", target: ".fuel", title: "Your fuel", html: "That burn used fuel from your tank. Segments with an orange outline are saved for the burns still ahead." },
];
let coachQueue: Coach[] = [];
function showCoach(list: Coach[]) {
  coachQueue = list.slice();
  playing = false; syncPlay();
  nextCoach();
}
function nextCoach() {
  const c = coachQueue.shift();
  const box = $("coach");
  if (!c) { hideCoach(); playing = true; syncPlay(); $("play").focus(); return; }
  coachDone.add(c.id);
  const more = coachQueue.length > 0;
  box.innerHTML = `<div class="label">Quick tour</div><h2 id="coach-h">${esc(c.title)}</h2><p>${c.html}</p><div class="acts">${more ? `<button type="button" class="btn ghost" data-c="skip">Skip tour</button>` : ""}<button type="button" class="btn solid" data-c="next">${more ? "Next" : "Got it, fly!"}</button></div>`;
  box.hidden = false;
  const tgt = document.querySelector(c.target) as HTMLElement | null;
  const sr = stage.getBoundingClientRect();
  if (tgt) {
    const r = tgt.getBoundingClientRect();
    const bw = box.offsetWidth, bh = box.offsetHeight;
    const left = Math.max(12, Math.min(sr.width - bw - 12, r.left - sr.left));
    let top = r.top - sr.top - bh - 12;
    if (top < 12) top = Math.min(sr.height - bh - 12, r.bottom - sr.top + 12);
    box.style.left = `${left}px`; box.style.top = `${top}px`;
  }
  box.querySelector<HTMLElement>("[data-c=next]")!.onclick = nextCoach;
  box.querySelector<HTMLElement>("[data-c=skip]")?.addEventListener("click", () => { coachQueue = []; COACH_BURN.forEach(x => coachDone.add(x.id)); nextCoach(); });
  box.querySelector<HTMLElement>("[data-c=next]")!.focus();
}
function hideCoach() { $("coach").hidden = true; }
function checkCoach() {
  if (!quickRun || !mission || !$("coach").hidden) return;
  if (!coachDone.has("play") && wall > 1.2) showCoach(COACH_START);
  else if (!coachDone.has("fuel")) {
    const firstBurn = mission.events.find(e => e.units > 0);
    if (firstBurn && wall > missionToWall(mission.segments, firstBurn.t) + 0.9) showCoach(COACH_BURN);
  }
}

function openHelp() {
  openModal(`<h3 id="modal-h">Help</h3>
    <p>Plan in five steps: where to go, where to launch from, which day and which fuel tank, then check the fuel. The orange Launch button is always at the bottom of the planner.</p>
    <div class="actions"><button type="button" class="btn solid" id="h-brief">${icon("i-replay")}Show the briefing again</button><button type="button" class="btn" id="h-quick">${icon("i-rocket")}Fly Apollo 11 now</button></div>
    <h4>Keyboard</h4>
    <dl class="keys"><dt><kbd>Tab</kbd></dt><dd>Move between groups. Arrow keys pick inside a group.</dd><dt><kbd>Space</kbd></dt><dd>Pause or play the flight</dd><dt><kbd>←</kbd> <kbd>→</kbd></dt><dd>Jump to the previous or next event</dd><dt><kbd>1</kbd> <kbd>2</kbd> <kbd>3</kbd></dt><dd>Speed 1×, 2×, 4×</dd><dt><kbd>W</kbd></dt><dd>Why? for the current step</dd><dt><kbd>P</kbd></dt><dd>Back to the plan</dd><dt><kbd>?</kbd></dt><dd>This help</dd></dl>
    <h4>Motion</h4><p>Reduce motion makes camera moves instant and turns off animations. It follows your device setting until you change it here or with the button above the planner.</p>
    <button type="button" class="btn" id="h-motion" aria-pressed="${reduceMotion}">${icon("i-motion")}Reduce motion</button>
    <h4>Privacy</h4><p>No accounts, ads or trackers. Your plan and challenge progress stay in this browser.</p>`);
  $("h-brief").onclick = () => openBriefing();
  $("h-quick").onclick = () => { modalOpener = null; modal.close(); void quickLaunch(); };
  $("h-motion").onclick = () => { $("motion-toggle").click(); $("h-motion").setAttribute("aria-pressed", String(reduceMotion)); };
}
$("open-help").onclick = openHelp;

// ------------------------------------------------------------ frame loop
const tmp = new THREE.Vector3();
let lastAngle: number | null = null;
let focusSegName = "", focusChangeWall = -10;
let prevFocus: { target: THREE.Vector3; dist: number } | null = null;
let lastSeg: Segment | null = null;
function focusFor(seg: Segment, cp: THREE.Vector3, mp: V): { target: THREE.Vector3; dist: number } {
  if (seg.focus === "craft") return { target: cp.clone(), dist: seg.zoom * 10 * Math.sqrt(fitK) };
  if (seg.focus === "earth") return { target: new THREE.Vector3(), dist: seg.zoom * 10 * fitK };
  if (seg.focus === "moon") return { target: v3(mp), dist: seg.zoom * 10 * fitK };
  return { target: v3(mp).multiplyScalar(0.5), dist: v3(mp).length() * 1.35 * fitK * aspK };
}
function prevSegRef(seg: Segment) {
  if (!mission) return seg;
  const i = mission.segments.findIndex(x => x.name === seg.name && x.t0 === seg.t0);
  return i > 0 ? mission.segments[i - 1] : seg;
}
let lastFrame = performance.now();
let lastEventIdx = -1;
let lastScrubText = "";
function frame(now: number) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.1, (now - lastFrame) / 1000);
  lastFrame = now;
  const moved = controls.update();
  // render on demand while planning: only when the camera moves or something changed
  if (!flying && !camAnim && !moved && !dirty) return;
  dirty = false;
  if (flying && mission) {
    const m = mission;
    const eW = endWall();
    if (playing && $("coach").hidden) wall = Math.min(eW, wall + dt * SPEEDS[speedIdx]);
    if (wall >= eW && playing) { playing = false; syncPlay(); }
    checkCoach();
    const t = wallToMission(m.segments, wall);
    scrub.value = String(Math.round((wall / W) * 1000));
    const jd = julianDay(new Date(m.liftoff.getTime() + t * 1000));
    setEarth(m.earthRotationDeg(t), jd);
    const mp = m.moon(t);
    setMoon(mp, m.moonAxes(t));
    const s = m.sun(t);
    sunLight.position.set(s[0] * 1e4, s[1] * 1e4, s[2] * 1e4);
    const c = m.craft(t);
    const cp = v3(c);
    (craftDot.geometry.attributes.position as THREE.BufferAttribute).setXYZ(0, cp.x, cp.y, cp.z);
    craftDot.geometry.attributes.position.needsUpdate = true;
    craftDot.geometry.computeBoundingSphere();
    craftLabel.position.set(cp.x, cp.y, cp.z);
    (flame.geometry.attributes.position as THREE.BufferAttribute).setXYZ(0, cp.x, cp.y, cp.z);
    flame.geometry.attributes.position.needsUpdate = true;
    flame.geometry.computeBoundingSphere();
    // engine glow around burns and during the climb to orbit
    const burning = m.events.some(e => e.units > 0 && Math.abs(missionToWall(m.segments, e.t) - wall) < 0.7) || t < 540;
    const fm = flame.material as THREE.PointsMaterial;
    fm.opacity = reduceMotion ? (burning ? 0.9 : 0) : fm.opacity + ((burning ? 0.9 : 0) - fm.opacity) * Math.min(1, dt * 8);
    // view frame: "space" (fixed stars) or "moon" (rotating with the Earth-Moon line)
    const rotOn = !!m.moonAngle && (viewMode === "moon" || (viewMode === "auto" && MOON_DESTS.includes(currentPlan.dest) && m.arrivalT !== undefined && t > m.arrivalT - 6 * 3600));
    for (const b of $("view-seg").querySelectorAll<HTMLElement>("button")) b.setAttribute("aria-pressed", String((b.dataset.view === "moon") === rotOn));
    $("view-badge").hidden = !rotOn;
    const rotKey = rotOn ? Math.round(t / 60) : -1;
    if (rotKey !== lastRotKey) {
      lastRotKey = rotKey;
      const attr = pathFuture.geometry.attributes.position as THREE.BufferAttribute;
      const a = attr.array as Float32Array;
      if (rotOn) {
        const z = new THREE.Vector3(...m.normal).normalize();
        const th0 = m.moonAngle!(t);
        const q = new THREE.Quaternion(), v = new THREE.Vector3();
        for (let i = 0; i < pathTimes.length; i++) {
          q.setFromAxisAngle(z, th0 - m.moonAngle!(pathTimes[i]));
          v.set(pathInert[3 * i], pathInert[3 * i + 1], pathInert[3 * i + 2]).applyQuaternion(q);
          a[3 * i] = v.x; a[3 * i + 1] = v.y; a[3 * i + 2] = v.z;
        }
      } else a.set(pathInert);
      attr.needsUpdate = true;
      syncLine2(pathDone.geometry, a, 0);
      for (const b of burnLines) syncLine2(b.line.geometry, a, b.i0);
      pathFuture.computeLineDistances();
      pathFuture.geometry.computeBoundingSphere();
      moonPath.visible = !rotOn && !["leo", "geo"].includes(currentPlan.dest);
    }
    // path progress
    let k = 0;
    while (k < pathTimes.length - 1 && pathTimes[k + 1] <= t) k++;
    pathDone.geometry.instanceCount = k;
    pathFuture.geometry.setDrawRange(k, Math.max(0, (m.failAt !== undefined ? pathTimes.findIndex(x => x >= m.failAt!) : pathTimes.length) - k));
    for (const b of burnLines) b.line.geometry.instanceCount = Math.max(0, Math.min(k, b.i1) - b.i0);
    // banner for burns
    const idx = phaseIdx(t);
    if (idx !== lastEventIdx) {
      const e = m.events[idx];
      if (idx > lastEventIdx && lastEventIdx >= 0 && e && e.units > 0) {
        const n = m.events.filter(x => x.units > 0 && x.t <= e.t).length;
        burnBanner(`Burn ${n} · ${SHORT_BURN[e.phase] ?? e.label} · ${fmtU(e.units)} units`);
      }
      lastEventIdx = idx;
    }
    // HUD: fuel (remaining white, reserved for burns ahead outlined orange)
    const fuel = Math.max(0, fuelAt(t));
    const future = m.events.filter(e => e.t > t + 1e-6 && e.units > 0 && (m.failAt === undefined || e.t <= m.failAt));
    const reserved = Math.min(fuel, future.reduce((s2, e) => s2 + e.units, 0));
    $("fuel-num").innerHTML = `${fmtU(fuel)} <small>/ ${state.tank} units</small>`;
    const nSeg = Math.round(state.tank / 5);
    const segs: string[] = [];
    for (let i = 0; i < nSeg; i++) {
      const mid = (i + 0.5) * 5;
      segs.push(mid <= fuel ? (mid > fuel - reserved ? "full res" : fuel / state.tank < 0.2 ? "low" : "full") : "");
    }
    const g = $("fuel-gauge");
    const gk = segs.join(",");
    if (g.dataset.k !== gk) {
      g.dataset.k = gk;
      g.style.setProperty("--n", String(nSeg));
      g.innerHTML = gaugeHTML(segs);
      g.setAttribute("aria-valuemin", "0"); g.setAttribute("aria-valuemax", String(state.tank)); g.setAttribute("aria-valuenow", fmtU(fuel));
      g.setAttribute("aria-valuetext", `${fmtU(fuel)} of ${state.tank} units left${reserved > 0 ? `, ${fmtU(reserved)} saved for burns ahead` : ""}`);
      const nb = future[0];
      const failB = m.failAt !== undefined ? currentPlan.burns.find(x => x.phase === m.failPhase) : undefined;
      $("fuel-next").innerHTML = nb ? `${icon("i-burn")}<span>Next burn: <b>${esc(SHORT_BURN[nb.phase] ?? nb.label)}, ${fmtU(nb.units)}</b></span>`
        : failB ? `${icon("i-alert")}<span>Next burn: <b>${esc(SHORT_BURN[failB.phase] ?? failB.label)}, ${fmtU(failB.units)}</b>. Not enough fuel!</span>`
        : `${icon("i-check")}<span>No more burns</span>`;
    }
    const date = new Date(m.liftoff.getTime() + t * 1000);
    $("met").innerHTML = metHTML(t);
    $("met-date").textContent = `${fmtLocal(date)} your time`;
    $("met-date").title = date.toISOString().slice(0, 16).replace("T", " ") + " UTC";
    const c2 = m.craft(t + 60);
    const speed = Math.hypot(c2[0] - c[0], c2[1] - c[1], c2[2] - c[2]) / 60;
    const dE = Math.hypot(...c), dM = Math.hypot(c[0] - mp[0], c[1] - mp[1], c[2] - mp[2]);
    $("stats").innerHTML = `<div><div class="label">Speed</div><div class="num">${speed.toFixed(2)}<small>km/s</small></div></div><div><div class="label">From Earth</div><div class="num">${Math.round(dE).toLocaleString("en-US")}<small>km</small></div></div><div><div class="label">From Moon</div><div class="num">${Math.round(dM).toLocaleString("en-US")}<small>km</small></div></div>`;
    updateCaption(t);
    updateStrip();
    const st = `Day ${Math.floor(t / 86400) + 1}, ${$("cap-title").textContent || ""}`;
    if (st !== lastScrubText) { lastScrubText = st; scrub.setAttribute("aria-valuetext", st); }
    // camera: follow the focus point exactly (it can move fast), ease between focus changes, ease the zoom
    if (rotOn && lastAngle !== null && m.moonAngle) {
      // in the Moon view, turn the camera with the Earth-Moon line so Earth and Moon stay put on screen
      const dA = m.moonAngle(t) - lastAngle;
      if (dA !== 0) {
        const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(...m.normal).normalize(), dA);
        const off = camera.position.clone().sub(controls.target).applyQuaternion(q);
        camera.position.copy(controls.target).add(off);
      }
    }
    lastAngle = m.moonAngle ? m.moonAngle(t) : null;
    if (autoCam && !camAnim) {
      const seg = segmentAt(m.segments, t);
      if (seg.name !== focusSegName) { prevFocus = focusFor(lastSeg ?? seg, cp, mp); focusSegName = seg.name; focusChangeWall = wall; }
      lastSeg = seg;
      const cur = focusFor(seg, cp, mp);
      const w = reduceMotion ? 1 : Math.min(1, Math.abs(wall - focusChangeWall) / 1.5);
      const ww = w * w * (3 - 2 * w);
      const prevNow = prevFocus ? focusFor(prevSegRef(seg), cp, mp) : cur;
      const target = prevNow.target.clone().lerp(cur.target, ww);
      const dist = prevNow.dist + (cur.dist - prevNow.dist) * ww;
      const shift = target.clone().sub(controls.target);
      controls.target.add(shift);
      camera.position.add(shift);
      const kk = reduceMotion ? 1 : 1 - Math.exp(-dt * 2.2);
      const dir = tmp.subVectors(camera.position, controls.target).normalize();
      if (performance.now() > userAimUntil && !rotOn) {
        // preferred angle: look down on the orbit plane at a slant; at launch, look over the rocket's shoulder
        const nrm = new THREE.Vector3(...m.normal).normalize();
        let want: THREE.Vector3;
        if (seg.focus === "craft" && seg.name === "launch") want = cp.clone().normalize().multiplyScalar(0.8).add(nrm.clone().multiplyScalar(0.6));
        else if (seg.focus === "craft") want = cp.clone().sub(v3(mp)).normalize().add(nrm.clone().multiplyScalar(0.4));
        else want = nrm.clone().multiplyScalar(0.85).add(new THREE.Vector3(...m.sun(t)).multiplyScalar(-0.45));
        dir.lerp(want.normalize(), reduceMotion ? 1 : 1 - Math.exp(-dt * 1.2)).normalize();
      }
      const curD = camera.position.distanceTo(controls.target);
      camera.position.copy(controls.target).add(dir.multiplyScalar(curD + (dist - curD) * kk));
    }
  }
  if (camAnim) {
    camAnim.t += dt / camAnim.dur;
    const e = camAnim.t >= 1 ? 1 : 1 - Math.pow(1 - camAnim.t, 3);
    camera.position.lerpVectors(camAnim.from, camAnim.to, e);
    controls.target.lerpVectors(camAnim.tFrom, camAnim.tTo, e);
    if (camAnim.t >= 1) { camAnim = null; dirty = true; }
  }
  updateLunarLabels();
  if (pinGroup.visible) {
    for (const [, p] of pins) {
      p.mesh.getWorldPosition(tmp);
      const facing = tmp.clone().normalize().dot(camera.position.clone().sub(tmp).normalize()) > 0.05;
      p.lab.element.style.visibility = facing ? "visible" : "hidden";
      p.mesh.visible = facing;
    }
  }
  const camDist = camera.position.distanceTo(controls.target);
  camera.near = Math.max(0.001, camDist / 2000);
  camera.far = 5e6;
  camera.updateProjectionMatrix();
  earthLabel.position.set(0, 0, 7.5);
  renderer.render(scene, camera);
  labels.render(scene, camera);
  if (!flying) declutterLabels();
}
/** Hide pin labels that would sit on top of another (selected first, then history, then the rest). */
function declutterLabels() {
  const items: { el: HTMLElement; pri: number }[] = [];
  for (const [id, p] of lunarPins) if (p.lab.element.style.visibility !== "hidden") items.push({ el: p.lab.element, pri: id === state.landingId ? 0 : p.site.kind === "historic" ? 1 : 2 });
  if (clusterLab.element.style.visibility !== "hidden") items.push({ el: clusterLab.element, pri: 0 });
  for (const [id, p] of pins) if (p.lab.element.style.visibility !== "hidden") items.push({ el: p.lab.element, pri: id === state.siteId ? 0 : 1 });
  items.sort((a, b) => a.pri - b.pri);
  const placed: DOMRect[] = [];
  for (const it of items) {
    const r = it.el.getBoundingClientRect();
    if (placed.some(q => r.left < q.right && r.right > q.left && r.top < q.bottom && r.bottom > q.top)) it.el.style.visibility = "hidden";
    else placed.push(r);
  }
}

function onResize() {
  const w = stage.clientWidth, h = stage.clientHeight;
  renderer.setSize(w, h);
  labels.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  doneMat.resolution.set(w, h); burnMat.resolution.set(w, h);
  if (flying) layoutHud(); else idleOffset();
  invalidate();
}
/** Planning view: nudge the globe right so the intro text sits beside it, not on it. */
function idleOffset() {
  const w = stage.clientWidth, h = stage.clientHeight;
  if (w > 900) camera.setViewOffset(w, h, -Math.min(200, w * 0.14), 0, w, h); else camera.clearViewOffset();
}
addEventListener("resize", onResize);
new ResizeObserver(onResize).observe(stage);

// ------------------------------------------------------------ start
// default date: the next good day from today (never a past day)
jumpToGoodDay();
if (state.dest === "surface") state.tank = tankForDest("surface", state.tank);
setSpeed(1);
setStep(1, false);
onResize();
idleScene();
camera.position.set(30, -30, 18);
refresh();
if (state.dest === "surface") focusLanding(); else focusSite();
requestAnimationFrame(frame);
if (!localStorage.getItem("cislunar-onboarded")) openBriefing();
