// Shared top bar. Every page has <header id="site-nav" data-page="home|mission|lab|about|teachers"></header>
// and imports this module (after site/base). Styling lives in src/site/nav.css.
// Wide screens: mark + wordmark and four links, the current page marked.
// Under 820px: a labelled "Menu" button opens a simple list (Esc, a second tap
// or tapping elsewhere closes it). No framework.
import "./nav.css";

const LINKS: [string, string, string][] = [
  ["mission", "/mission", "Mission planner"],
  ["lab", "/lab", "Orbit lab"],
  ["teachers", "/teachers", "For teachers"],
  ["about", "/about", "About"],
];
const GITHUB = "https://github.com/jdoscher/sicklunar";

const icon = (d: string, size = 20) =>
  `<svg viewBox="0 0 24 24" width="${size}" height="${size}" aria-hidden="true" focusable="false"><path d="${d}" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" fill="none"/></svg>`;
const ICON_MENU = icon("M4 7h16M4 12h16M4 17h16");
const ICON_CLOSE = icon("M6 6l12 12M18 6L6 18");
const ICON_EXT = icon("M14 5h5v5M19 5l-8 8M17 14v5H5V7h5", 16);

const items = (page: string) => LINKS.map(([id, href, label]) =>
  `<li><a href="${href}"${id === page ? ' aria-current="page"' : ""}>${label}</a></li>`).join("");

/** Adds a "Skip to content" link before the bar when the page has a <main>. */
function addSkipLink(el: HTMLElement): void {
  const main = document.querySelector("main");
  if (!main || document.querySelector(".skip-link")) return;
  if (!main.id) main.id = "main";
  if (!main.hasAttribute("tabindex")) main.setAttribute("tabindex", "-1");
  const a = document.createElement("a");
  a.className = "skip-link";
  a.href = `#${main.id}`;
  a.textContent = "Skip to content";
  el.before(a);
}

export function mountNav(): void {
  const el = document.getElementById("site-nav");
  if (!el) return;
  const page = el.dataset.page ?? "";
  el.classList.add("site-nav");
  el.innerHTML = `
    <a class="nav-brand" href="/" aria-label="Sicklunar home"><img class="nav-mark" src="/brand/mark-1-sickle-onhull.svg?v=1" alt="" width="32" height="32"><span class="nav-word" aria-hidden="true"><span class="w-a">Sick</span><span class="w-b">lunar</span></span></a>
    <nav class="nav-links" aria-label="Site"><ul>${items(page)}</ul></nav>
    <button class="nav-menu-btn" type="button" aria-expanded="false" aria-controls="site-menu">${ICON_MENU}<span class="nav-menu-label">Menu</span></button>
    <nav class="nav-menu" id="site-menu" aria-label="Site menu" hidden><ul>${items(page)}
      <li><a href="${GITHUB}">Source on GitHub ${ICON_EXT}</a></li></ul></nav>`;
  addSkipLink(el);

  const btn = el.querySelector<HTMLButtonElement>(".nav-menu-btn")!;
  const menu = el.querySelector<HTMLElement>(".nav-menu")!;
  const label = el.querySelector<HTMLElement>(".nav-menu-label")!;
  const isOpen = () => btn.getAttribute("aria-expanded") === "true";
  const setOpen = (open: boolean, returnFocus = false) => {
    if (open === isOpen()) return;
    btn.setAttribute("aria-expanded", String(open));
    menu.hidden = !open;
    el.classList.toggle("menu-open", open);
    btn.querySelector("svg")!.outerHTML = open ? ICON_CLOSE : ICON_MENU;
    label.textContent = open ? "Close" : "Menu";
    if (returnFocus) btn.focus();
  };
  btn.addEventListener("click", () => setOpen(!isOpen()));
  el.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && isOpen()) { e.preventDefault(); setOpen(false, true); }
  });
  document.addEventListener("click", (e) => { if (isOpen() && !el.contains(e.target as Node)) setOpen(false); });
  el.addEventListener("focusout", (e) => {
    const to = e.relatedTarget as Node | null;
    if (isOpen() && to && !el.contains(to)) setOpen(false);
  });
  matchMedia("(min-width: 820px)").addEventListener("change", (m) => { if (m.matches) setOpen(false); });
}
mountNav();
