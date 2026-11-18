"""Line drawings of key orbits (PNG + SVG): black line art, km scale bars, Lagrange points.

Drawings 05-20 are propagated JPL catalog members; 01-04 are schematics.
"""
from __future__ import annotations

import json
import math
import os

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np

from .cr3bp import EARTH_MOON, lagrange_points
from . import key_orbits

LINE = "#111111"
GREY = "#9a9a9a"
plt.rcParams.update({"font.family": "Helvetica", "font.size": 9, "svg.fonttype": "none"})


def bodies(ax, sysd, plane, show_earth, show_moon=True, lpts=("L1", "L2")):
    mu = sysd.mu; L = sysd.lunit_km
    Rm = sysd.r_secondary_km / L
    Re = sysd.r_primary_km / L
    LP = lagrange_points(mu)
    pos = {"x": 0, "y": 1, "z": 2}
    a, b = pos[plane[0]], pos[plane[1]]
    def at(p):
        return p[a], p[b]
    if show_moon:
        c = at((1 - mu, 0, 0))
        ax.add_patch(plt.Circle(c, Rm, fill=False, lw=0.9, color=LINE))
        ax.annotate("Moon" if sysd.name == "Earth-Moon" else "Earth", c, xytext=(4, -10), textcoords="offset points", fontsize=7, color=GREY)
    if show_earth:
        c = at((-mu, 0, 0))
        ax.add_patch(plt.Circle(c, Re, fill=False, lw=0.9, color=LINE))
        ax.annotate("Earth" if sysd.name == "Earth-Moon" else "Sun", c, xytext=(4, -10), textcoords="offset points", fontsize=7, color=GREY)
    for lp in lpts:
        p = LP[lp]
        c = at(p)
        ax.plot(*c, marker="+", ms=6, mew=0.8, color=GREY)
        ax.annotate(lp, c, xytext=(3, 3), textcoords="offset points", fontsize=7, color=GREY)


def style(ax, xl, yl):
    ax.set_aspect("equal", adjustable="datalim")
    for s in ax.spines.values():
        s.set_visible(False)
    ax.set_xticks([]); ax.set_yticks([])
    ax.set_xlabel(xl, fontsize=7, color=GREY); ax.set_ylabel(yl, fontsize=7, color=GREY)


def scalebar(ax, L, km):
    x0, x1 = ax.get_xlim(); y0, y1 = ax.get_ylim()
    w = km / L
    xs = x0 + 0.05 * (x1 - x0); ys = y0 + 0.05 * (y1 - y0)
    ax.plot([xs, xs + w], [ys, ys], color=LINE, lw=1)
    ax.text(xs + w / 2, ys + 0.015 * (y1 - y0), f"{km:,} km", ha="center", va="bottom", fontsize=7)


def nice_km(span_km):
    for k in [1000, 2000, 5000, 10000, 20000, 50000, 100000, 200000, 500000, 1000000]:
        if k > span_km / 6:
            return k
    return k


def draw(out, slug, title, sysd, X, three_d, show_earth=False, lpts=("L1", "L2"), note=""):
    L = sysd.lunit_km
    planes = [("x", "y", "Top view (Earth-Moon plane)"), ("x", "z", "Side view"), ("y", "z", "Front view (from Earth)")] if three_d else [("x", "y", "Top view (Earth-Moon plane)")]
    n = len(planes) + (1 if three_d else 0)
    fig = plt.figure(figsize=(3.9 * n, 4.4))
    idx = {"x": 0, "y": 1, "z": 2}
    for i, (a, b, lab) in enumerate(planes):
        ax = fig.add_subplot(1, n, i + 1)
        ax.plot(X[idx[a]], X[idx[b]], color=LINE, lw=1.1)
        ax.plot(X[idx[a]][0], X[idx[b]][0], marker="o", ms=2.5, color=LINE)
        bodies(ax, sysd, (a, b), show_earth, lpts=lpts)
        style(ax, f"{a} (toward Moon)" if a == "x" else a, b)
        ax.set_title(lab, fontsize=8, color=GREY)
        ax.autoscale_view()
        y0, y1 = ax.get_ylim(); ax.set_ylim(y0 - 0.18 * (y1 - y0), y1)
        span = (ax.get_xlim()[1] - ax.get_xlim()[0]) * L
        scalebar(ax, L, nice_km(span))
    if three_d:
        ax = fig.add_subplot(1, n, n, projection="3d")
        ax.plot(X[0], X[1], X[2], color=LINE, lw=1.0)
        mu = sysd.mu
        u, v = np.mgrid[0:2 * np.pi:24j, 0:np.pi:12j]
        r = sysd.r_secondary_km / L
        ax.plot_wireframe(1 - mu + r * np.cos(u) * np.sin(v), r * np.sin(u) * np.sin(v), r * np.cos(v), color=GREY, lw=0.3)
        for lp in lpts:
            p = lagrange_points(mu)[lp]
            ax.scatter(*p, marker="+", color=GREY, s=20)
        ax.set_box_aspect((np.ptp(X[0]) or 1, np.ptp(X[1]) or 1, np.ptp(X[2]) or 1))
        ax.set_axis_off()
        ax.view_init(elev=22, azim=-60)
        ax.set_title("3D view", fontsize=8, color=GREY)
    fig.suptitle(title, fontsize=11, x=0.02, ha="left")
    if note:
        fig.text(0.02, 0.01, note, fontsize=7, color=GREY)
    fig.tight_layout(rect=(0, 0.03, 1, 0.95))
    for ext in ("png", "svg"):
        fig.savefig(os.path.join(out, f"{slug}.{ext}"), dpi=160, facecolor="white")
    plt.close(fig)


SRC = "Data: NASA/JPL Three-Body Periodic Orbits API (CR3BP, rotating frame)."



def draw_key_orbits(out: str) -> dict:
    os.makedirs(out, exist_ok=True)
    stats = {}
    for k in key_orbits.KEY_ORBITS:
        m = key_orbits.member(k.slug)
        _, X = m.trajectory(3000)
        stats[k.slug] = m.metrics()
        draw(out, k.slug, k.title, m.family.system, X, k.three_d, show_earth=k.show_earth, lpts=k.lpts,
             note=SRC + (" " + k.note if k.note else ""))
    stats.update(draw_schematics(out))
    with open(os.path.join(out, "stats.json"), "w") as f:
        json.dump(stats, f, indent=1)
    return stats


def draw_schematics(out: str) -> dict:
    stats = {}
    mu = EARTH_MOON.mu
    L_EM = EARTH_MOON.lunit_km
    LPS = lagrange_points(mu)
    mu = 1.215058560962404e-02


    def save(fig, out, slug):
        for ext in ("png", "svg"):
            fig.savefig(os.path.join(out, f"{slug}.{ext}"), dpi=160, facecolor="white")
        plt.close(fig)


    # 01 context: LEO/MEO/GEO/Warden line/Moon orbit (to scale)
    fig, axs = plt.subplots(1, 2, figsize=(9, 4.6))
    for ax, lim, lab in [(axs[0], 50000, "Near Earth (to scale)"), (axs[1], 480000, "Out to the Moon (to scale)")]:
        th = np.linspace(0, 2 * np.pi, 400)
        rings = [(6378, "Earth", "-"), (6378 + 2000, "LEO ≤2,000 km", "-"), (26560, "MEO (GPS) 20,200 km alt", "-"),
                 (42164, "GEO 35,786 km alt", "-"), (100000, "~100,000 km: Moon's pull starts to matter", "--"),
                 (384400, "Moon's orbit", "-")]
        for r, name, ls in rings:
            if r < lim * 1.05:
                if lim > 400000 and r < 50000:
                    ax.plot(r * np.cos(th), r * np.sin(th), color=LINE, lw=0.6); continue
                ax.plot(r * np.cos(th), r * np.sin(th), ls, color=LINE if ls == "-" else GREY, lw=0.8)
                ax.annotate(name, (r * math.cos(0.8), r * math.sin(0.8)), fontsize=6.5, xytext=(3, 0), textcoords="offset points")
        if lim > 400000:
            ax.add_patch(plt.Circle((384400, 0), 1737, color=LINE))
            ax.annotate("Moon", (384400, 0), xytext=(4, -10), textcoords="offset points", fontsize=7)
        ax.set_xlim(-lim, lim); ax.set_ylim(-lim, lim); style(ax, "", ""); ax.set_title(lab, fontsize=8, color=GREY)
    fig.suptitle("Where cislunar space starts", fontsize=11, x=0.02, ha="left")
    fig.text(0.02, 0.01, "Radii from Earth's center. LEO/MEO/GEO altitudes: standard definitions; ~100,000 km boundary per AFPC video / AFRL primer.", fontsize=7, color=GREY)
    fig.tight_layout(rect=(0, 0.03, 1, 0.95)); save(fig, out, "01-regions")

    # 02 Lagrange points
    fig, ax = plt.subplots(figsize=(6.5, 6))
    th = np.linspace(0, 2 * np.pi, 400)
    ax.plot((1 - mu) * np.cos(th), (1 - mu) * np.sin(th), ":", color=GREY, lw=0.7)
    ax.add_patch(plt.Circle((-mu, 0), 6378 / L_EM, fill=False, color=LINE, lw=1)); ax.annotate("Earth", (-mu, 0), xytext=(4, -10), textcoords="offset points", fontsize=7)
    ax.add_patch(plt.Circle((1 - mu, 0), 1737 / L_EM, fill=False, color=LINE, lw=1)); ax.annotate("Moon", (1 - mu, 0), xytext=(4, -12), textcoords="offset points", fontsize=7)
    for lp in ["L1", "L2", "L3", "L4", "L5"]:
        p = LPS[lp]
        ax.plot(p[0], p[1], marker="+", ms=9, mew=1, color=LINE)
        d = math.hypot(p[0] - (1 - mu), p[1]) * L_EM
        off = {"L1": (-38, 10), "L2": (6, -22)}.get(lp, (4, 4))
        ax.annotate(f"{lp}\n{d/1000:,.0f}k km from Moon", (p[0], p[1]), xytext=off, textcoords="offset points", fontsize=7)
    for lp in ["L4", "L5"]:
        p = LPS[lp]
        ax.plot([-mu, p[0], 1 - mu], [0, p[1], 0], color=GREY, lw=0.5)
    style(ax, "x (toward Moon)", "y"); ax.autoscale_view()
    ax.set_title("Earth-Moon Lagrange points (rotating frame, to scale)", fontsize=10, loc="left")
    fig.text(0.02, 0.01, "Positions: NASA/JPL Three-Body Periodic Orbits API system constants. L4/L5 form equilateral triangles with Earth and Moon.", fontsize=7, color=GREY)
    fig.tight_layout(rect=(0, 0.03, 1, 1)); save(fig, out, "02-lagrange-points")

    # 03 Low lunar orbit + frozen inclinations
    fig, axs = plt.subplots(1, 2, figsize=(8.5, 4.4))
    ax = axs[0]
    ax.add_patch(plt.Circle((0, 0), 1737, fill=False, color=LINE, lw=1))
    ax.add_patch(plt.Circle((0, 0), 1837, fill=False, color=LINE, lw=1, ls="-"))
    ax.annotate("100 km circular LLO", (1837 * 0.7, 1837 * 0.72), xytext=(10, 10), textcoords="offset points", fontsize=7, arrowprops=dict(arrowstyle="-", lw=0.5))
    ax.set_xlim(-2300, 2300); ax.set_ylim(-2300, 2300); style(ax, "", ""); ax.set_title("Top view (to scale)", fontsize=8, color=GREY)
    ax = axs[1]
    ax.add_patch(plt.Circle((0, 0), 1737, fill=False, color=LINE, lw=1))
    ax.plot([-2300, 2300], [0, 0], ":", color=GREY, lw=0.6); ax.annotate("lunar equator", (1900, 40), fontsize=6.5, color=GREY)
    for inc in [27, 50, 76, 86]:
        a = math.radians(inc); r = 1837
        ax.plot([-r * math.cos(a), r * math.cos(a)], [-r * math.sin(a), r * math.sin(a)], color=LINE, lw=0.8)
        ax.annotate(f"{inc}°", (r * math.cos(a), r * math.sin(a)), xytext=(3, 2), textcoords="offset points", fontsize=7)
    ax.set_xlim(-2300, 2300); ax.set_ylim(-2300, 2300); style(ax, "", ""); ax.set_title("Edge-on: the four 'frozen' inclinations", fontsize=8, color=GREY)
    fig.suptitle("Low lunar orbit (LLO)", fontsize=11, x=0.02, ha="left")
    fig.text(0.02, 0.01, "Frozen inclinations 27°, 50°, 76°, 86°: Wikipedia 'Lunar orbit' (NASA 2006). Moon-centered inertial view.", fontsize=7, color=GREY)
    fig.tight_layout(rect=(0, 0.03, 1, 0.95)); save(fig, out, "03-low-lunar-orbit")

    # 04 ELFO (illustrative Keplerian: 12 h period, ~100 km perilune, apolune over south pole)
    GMm = 4902.800066
    T = 12 * 3600
    a = (GMm * T**2 / (4 * math.pi**2)) ** (1 / 3)
    rp = 1737 + 100; e = 1 - rp / a; ra = a * (1 + e)
    nu = np.linspace(0, 2 * np.pi, 600)
    r = a * (1 - e**2) / (1 + e * np.cos(nu))
    # argument of perilune 90 deg with orbit plane ~polar: perilune over north pole, apolune over south pole
    xs, zs = r * np.cos(nu + math.pi / 2), r * np.sin(nu + math.pi / 2)
    fig, ax = plt.subplots(figsize=(5, 6))
    ax.plot(xs, zs, color=LINE, lw=1.1)
    ax.add_patch(plt.Circle((0, 0), 1737, fill=False, color=LINE, lw=1))
    ax.annotate("N", (0, 1737), xytext=(-3, 4), textcoords="offset points", fontsize=7, color=GREY)
    ax.annotate("S", (0, -1737), xytext=(-3, -10), textcoords="offset points", fontsize=7, color=GREY)
    ax.annotate(f"apolune ≈ {ra - 1737:,.0f} km altitude\n(over the south pole: long dwell)", (0, -ra), xytext=(30, 10), textcoords="offset points", fontsize=7)
    ax.annotate(f"perilune ≈ 100 km", (0, rp), xytext=(10, 6), textcoords="offset points", fontsize=7)
    style(ax, "", ""); ax.autoscale_view()
    ax.set_title("Elliptical lunar frozen orbit (ELFO), illustrative", fontsize=10, loc="left")
    fig.text(0.02, 0.01, "Illustrative 12-hour Keplerian ellipse, edge-on polar view. Concept per NASA LCRNS reference constellation.", fontsize=6.5, color=GREY)
    fig.tight_layout(rect=(0, 0.03, 1, 1)); save(fig, out, "04-elfo")
    stats["04-elfo"] = {"illustrative": True, "period_h": 12, "perilune_alt_km": 100, "apolune_alt_km": round(ra - 1737), "ecc": round(e, 3)}


    return stats
