// Reading pages (/about, /teachers): shared bar, styles, and an "On this page"
// list that marks the section you are reading (aria-current="true").
import "./base";
import "./nav";
import "./pages.css";
import "./reading.css";

function trackToc(): void {
  const links = [...document.querySelectorAll<HTMLAnchorElement>(".toc a[href^='#']")];
  const sections = links
    .map((a) => document.getElementById(a.hash.slice(1)))
    .filter((s): s is HTMLElement => !!s);
  if (!sections.length || !("IntersectionObserver" in window)) return;
  const mark = (id: string) => links.forEach((a) =>
    a.hash === `#${id}` ? a.setAttribute("aria-current", "true") : a.removeAttribute("aria-current"));
  const visible = new Map<string, boolean>();
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) visible.set(e.target.id, e.isIntersecting);
    const first = sections.find((s) => visible.get(s.id));
    if (first) mark(first.id);
  }, { rootMargin: "0px 0px -60% 0px" });
  sections.forEach((s) => io.observe(s));
}
trackToc();
