"""Compute the mission planner's transfers and write web data.

Usage: python scripts/build_missions.py   (about 2-4 minutes, runs destinations in parallel)
Writes cislunar/mission_data/transfers.json (committed; the web export copies it).
"""
from __future__ import annotations

import json
import math
import sys
import time
from multiprocessing import Pool
from pathlib import Path

import numpy as np

from cislunar import key_orbits
from cislunar.transfers import (
    DAY, E, L, M, MU, R_ENTRY, R_LLO, VU, _hit, _resample, arrival_state_moon, back_to_leo, circ_speed,
    leo_end_constraints, leo_state, lunar_incl_cos, moon_guess_from_state, perilune_after, prop, refine_free_return,
    refine_llo_back, refine_target, scan_forward, target, tg_state, tli_of, v_inertial_rel,
)

OUT = Path(__file__).resolve().parents[1] / "cislunar" / "mission_data" / "transfers.json"

TARGETS = {  # dest: (key orbit slug, scan days, out-of-plane tilts to scan)
    "dro": ("14-dro", 12, [0]),
    "nrho": ("09-nrho-9-2", 10, [-30, -15, 0, 15]),
    "l1halo": ("07-l1-halo", 10, [-30, -15, 0, 15, 30]),
    "l2halo": ("08-l2-halo", 12, [-30, -15, 0, 15, 30]),
    "l4": ("17-l4-short-period", 40, [0]),
}


def forward_arc(s_dep, T, n=700):
    sol = prop(s_dep, T, n=8000)
    return _resample(sol.t, sol.y, n)


def build_target(dest):
    slug, days, elevs = TARGETS[dest]
    tg = target(slug)
    cands = scan_forward(tg, days, elevs, np.arange(3.06, 3.22, 0.02), range(0, 360, 4), top=6)
    best = None
    for c in cands[:5]:
        res, back = refine_target(tg, c, days * 1.3)
        s = back(res.x)
        con = leo_end_constraints(s)
        if np.abs(con).max() > 1e-3:
            continue
        cost = tli_of(s) + np.linalg.norm(res.x[1:4])
        if best is None or cost < best[0]:
            best = (cost, res.x, s)
    if best is None:
        raise RuntimeError(f"{dest}: no converged transfer")
    _, x, s_dep = best
    tau, T = float(x[0]) % tg.P, float(x[4])
    times, pts = forward_arc(s_dep, T)
    m = key_orbits.member(slug)
    _, X = m.trajectory(6000)
    t_orb = np.linspace(0, m.period, 6000)
    ot, op = _resample(t_orb, X, 500)
    return {
        "dest": dest, "tli_kms": round(tli_of(s_dep) * VU, 4), "arrive_kms": round(float(np.linalg.norm(x[1:4])) * VU, 4),
        "tof_days": round(T / DAY, 3), "times": times, "points": pts,
        "orbit": {"slug": slug, "period": m.period, "times": ot, "points": op, "start": tau},
        "notes": "Direct transfer: one burn leaving Earth orbit, one burn matching the target orbit (CR3BP).",
    }


def build_llo_polar(_dest="llo_polar"):
    """Arrive in a 100 km polar lunar orbit (passes over both poles)."""
    return build_llo("llo_polar", polar=True)


def build_llo(_dest="llo", polar=False):
    cands = []
    for dv in np.arange(3.08, 3.20, 0.01):
        for a in range(0, 360, 3):
            s0 = leo_state(math.radians(a), 0.0, dv / VU)
            p = perilune_after(s0, 6)
            if p is None:
                continue
            rp = np.linalg.norm(p[1][:3] - M) * L
            if rp < 8000 and 2.5 < p[0] / DAY < 5.5:
                cands.append((rp, a, dv, p[0], p[1]))
    cands.sort(key=lambda c: c[0])
    best = None
    for c in cands[:3]:
        guesses = [moon_guess_from_state(c[4])]
        if polar:  # turn the arrival velocity north or south so the orbit crosses the poles
            g = guesses[0]
            guesses = [[g[0], g[1], g[2] + sgn * math.pi / 2, g[3]] for sgn in (1, -1)] + \
                      [[g[0], g[1], g[2] + sgn * math.pi / 3, g[3]] for sgn in (1, -1)]
        for g in guesses:
            res = refine_llo_back(g, min(c[3], 4.4 * DAY), tmin_days=3.0, tmax_days=4.5, polar=polar)
            s = back_to_leo(arrival_state_moon(res.x[:4]), res.x[4])
            if np.abs(leo_end_constraints(s)).max() > 1e-4:
                continue
            if polar and abs(lunar_incl_cos(res.x)) > 1e-3:
                continue
            if best is None or res.fun < best.fun:
                best = res
    if best is None:
        raise RuntimeError(f"{_dest}: no converged transfer")
    x = best.x
    s_arr = arrival_state_moon(x[:4])
    s_dep = back_to_leo(s_arr, x[4])
    times, pts = forward_arc(s_dep, x[4])
    r_rel = (s_arr[:3] - M)
    v_rel = v_inertial_rel(s_arr[:3], s_arr[3:], M)
    return {
        "dest": _dest, "tli_kms": round(tli_of(s_dep) * VU, 4), "arrive_kms": round((x[3] - circ_speed(R_LLO, MU)) * VU, 4),
        "tof_days": round(x[4] / DAY, 3), "perilune_km": 100, "times": times, "points": pts,
        "llo": {"r": r_rel.round(8).tolist(), "v": (v_rel / np.linalg.norm(v_rel)).round(8).tolist(),
                "period_min": round(2 * math.pi * math.sqrt((R_LLO * L) ** 3 / 4902.8) / 60, 1)},
        "notes": "Direct transfer to a 100 km perilune, then a braking burn into a circular 100 km "
                 + ("polar orbit that passes over both lunar poles (CR3BP)." if polar else "orbit (CR3BP)."),
    }


def build_flyby(_dest="flyby"):
    best = []
    for dv in np.arange(3.10, 3.20, 0.005):
        for a in range(180, 300, 2):
            s0 = leo_state(math.radians(a), 0.0, dv / VU)
            sol = prop(s0, 12 * DAY, events=[_hit(E, R_ENTRY), _hit(M, 1737.4 / L)], n=1500)
            if len(sol.t_events[1]):
                continue
            P = sol.y[:3].T
            rM = np.linalg.norm(P - M, axis=1)
            k = int(np.argmin(rM))
            if rM[k] * L > 15000:
                continue
            rE = np.linalg.norm(P[k:] - E, axis=1)
            best.append((abs(rE.min() * L - 6500), a, dv))
    best.sort()
    _, a, dv = best[0]
    res, run = refine_free_return(math.radians(a), dv / VU)
    s0, sol = run(res.x)
    t = np.linspace(0, sol.t[-1], 20000)
    Y = sol.sol(t)
    rM = np.linalg.norm(Y[:3].T - M, axis=1)
    rE = np.linalg.norm(Y[:3].T - E, axis=1)
    k = int(np.argmin(rM))
    kE = k + int(np.argmin(rE[k:]))
    times, pts = _resample(t[: kE + 1], Y[:, : kE + 1], 800)
    return {
        "dest": "flyby", "tli_kms": round(res.x[1] * VU, 4), "arrive_kms": 0.0, "tof_days": round(t[kE] / DAY, 3),
        "perilune_km": round(float(rM[k] * L - 1737.4)), "flyby_day": round(t[k] / DAY, 3),
        "times": times, "points": pts,
        "notes": "Free return: after leaving Earth orbit, the Moon's gravity bends the path back to Earth with no more burns (CR3BP).",
    }


def build(dest):
    t0 = time.time()
    try:
        r = build_llo() if dest == "llo" else build_llo_polar() if dest == "llo_polar" else build_flyby() if dest == "flyby" else build_target(dest)
        print(f"{dest}: TLI {r['tli_kms']:.3f} arrive {r['arrive_kms']:.3f} km/s, {r['tof_days']:.2f} d ({time.time() - t0:.0f}s)", flush=True)
        return dest, r
    except Exception as e:  # report, keep the others
        print(f"{dest}: FAILED {e}", flush=True)
        return dest, None


if __name__ == "__main__":
    dests = sys.argv[1:] or ["llo", "llo_polar", "flyby", *TARGETS]
    old = json.loads(OUT.read_text()) if OUT.exists() else {}
    with Pool(len(dests)) as pool:
        results = dict(pool.map(build, dests))
    for k, v in results.items():
        if v is not None:
            old[k] = v
    if "llo" in old:
        old["surface"] = {**old["llo"], "dest": "surface"}
    OUT.parent.mkdir(exist_ok=True)
    OUT.write_text(json.dumps(old, separators=(",", ":")))
    print("wrote", OUT, sorted(old))
