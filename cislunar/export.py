"""Export orbit data as JSON for the web apps (viewer, planner, SDA tool).

Layout written to OUT:
  index.json                 systems, Lagrange points, family list, key orbits (with polylines)
  families/<key>.json        sampled members of one family (polylines + metrics)
Coordinates are rotating-frame, nondimensional (multiply by lunit_km for km), rounded to 5 decimals
(~4 km in the Earth-Moon system).
"""
from __future__ import annotations

import json
import os
import shutil
from pathlib import Path

import numpy as np

from . import catalog, key_orbits
from .cr3bp import EARTH_MOON, SUN_EARTH, lagrange_points


def _resample(t, X, n_keep):
    """Pick ~n_keep samples spaced evenly by arc length (dense where the orbit turns fast, e.g. NRHO
    perilune), keeping each sample's time so the app can animate at true speed."""
    P = X[:3].T
    seg = np.linalg.norm(np.diff(P, axis=0), axis=1)
    s = np.concatenate([[0.0], np.cumsum(seg)])
    target = np.linspace(0, s[-1], n_keep)
    idx = np.unique(np.concatenate([np.searchsorted(s, target).clip(0, len(s) - 1), [0, len(s) - 1]]))
    return np.round(t[idx], 6).tolist(), np.round(P[idx], 5).tolist()


def _system_json(s):
    return {
        "name": s.name, "mu": s.mu, "lunit_km": s.lunit_km, "tunit_s": s.tunit_s,
        "r_primary_km": s.r_primary_km, "r_secondary_km": s.r_secondary_km,
        "lagrange": {k: [round(float(c), 8) for c in v] for k, v in lagrange_points(s.mu).items()},
    }


def export(out: str, members_per_family: int = 24, points: int = 320) -> dict:
    os.makedirs(os.path.join(out, "families"), exist_ok=True)
    fams = []
    for key, sysname, _params, name in catalog.FAMILIES:
        fam = catalog.load(key)
        ms = []
        for m in fam.sample(members_per_family):
            t, X = m.trajectory(6000)
            met = m.metrics(6000)
            met.pop("family")
            met["state0"] = [float(v) for v in m.state0]
            met["period"] = m.period
            met["times"], met["points"] = _resample(t, X, points)
            ms.append(met)
        lim = {k: [float(v) for v in vals] for k, vals in fam.limits.items()}
        with open(os.path.join(out, "families", f"{key}.json"), "w") as f:
            json.dump({"key": key, "name": name, "system": sysname, "count": len(fam), "limits": lim, "members": ms},
                      f, separators=(",", ":"))
        fams.append({"key": key, "name": name, "system": sysname, "count": len(fam),
                     "period_days": [round(p * fam.system.tunit_days, 3) for p in lim.get("period", [])]})
    keys = []
    for k in key_orbits.KEY_ORBITS:
        m = key_orbits.member(k.slug)
        t, X = m.trajectory(12000)
        met = m.metrics(12000)
        times, pts = _resample(t, X, 700)
        keys.append({"slug": k.slug, "title": k.title, "family": k.family, "three_d": k.three_d,
                     "state0": [float(v) for v in m.state0], "period": m.period, **met, "times": times, "points": pts})
    index = {"source": "NASA/JPL Three-Body Periodic Orbits API, propagated with the cislunar package (CR3BP)",
             "systems": {"earth-moon": _system_json(EARTH_MOON), "sun-earth": _system_json(SUN_EARTH)},
             "families": fams, "key_orbits": keys}
    with open(os.path.join(out, "index.json"), "w") as f:
        json.dump(index, f, separators=(",", ":"))
    # cited research tables (transfers, SDA sensors, missions) used by the Planner/Coverage modes
    for src in (Path(__file__).with_name("research_data")).glob("*.json"):
        shutil.copy(src, os.path.join(out, src.name))
    # mission planner transfers (computed by scripts/build_missions.py)
    mt = Path(__file__).with_name("mission_data") / "transfers.json"
    if mt.exists():
        export_mission(json.loads(mt.read_text()), out)
    # the Mission Planner needs only the Earth-Moon constants, not the whole orbit index
    with open(os.path.join(out, "system.json"), "w") as f:
        json.dump({"earth-moon": _system_json(EARTH_MOON)}, f, separators=(",", ":"))
    return {"families": len(fams), "key_orbits": len(keys)}


def _r4(x):
    """Round nested numbers to 5 decimals (nondimensional; about 4 km, invisible at screen scale)."""
    if isinstance(x, float):
        return round(x, 5)
    if isinstance(x, list):
        return [_r4(v) for v in x]
    if isinstance(x, dict):
        return {k: _r4(v) for k, v in x.items()}
    return x


def export_mission(tr: dict, out: str) -> None:
    """Mission Planner data: a small planning summary loaded at startup, and one path file per
    transfer fetched only when that mission launches. 'surface' reuses the 'llo' path."""
    summary, paths = {}, {}
    for key, t in tr.items():
        if key == "surface":
            summary[key] = {**{k: v for k, v in t.items() if k not in ("times", "points")}, "path": "llo"}
            continue
        s = {k: v for k, v in t.items() if k not in ("times", "points", "orbit")}
        if "orbit" in t:
            s["orbit"] = {k: v for k, v in t["orbit"].items() if k not in ("times", "points")}
        s["path"] = key
        summary[key] = s
        p = {"times": t["times"], "points": t["points"]}
        if "orbit" in t:
            p["orbit"] = {"times": t["orbit"]["times"], "points": t["orbit"]["points"]}
        paths[key] = _r4(p)
    with open(os.path.join(out, "mission_summary.json"), "w") as f:
        json.dump(summary, f, separators=(",", ":"))
    os.makedirs(os.path.join(out, "mission_paths"), exist_ok=True)
    for key, p in paths.items():
        with open(os.path.join(out, "mission_paths", f"{key}.json"), "w") as f:
            json.dump(p, f, separators=(",", ":"))
