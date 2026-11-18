"""NASA/JPL Three-Body Periodic Orbits catalog: fetch, cache, select, describe.

API docs: https://ssd-api.jpl.nasa.gov/doc/periodic_orbits.html
Cached responses live gzipped in cislunar/jpl_cache/ and are committed, so the
apps work offline. `refresh()` re-downloads them.
"""
from __future__ import annotations

import gzip
import json
import urllib.request
from dataclasses import dataclass, field
from pathlib import Path

import numpy as np

from .cr3bp import EARTH_MOON, SUN_EARTH, System, distances_km, propagate

API = "https://ssd-api.jpl.nasa.gov/periodic_orbits.api"
CACHE = Path(__file__).with_name("jpl_cache")

# (key, sys, params, human name)
FAMILIES: list[tuple[str, str, dict, str]] = []
for lp in (1, 2, 3):
    FAMILIES.append((f"lyapunov-L{lp}", "earth-moon", {"family": "lyapunov", "libr": lp}, f"L{lp} Lyapunov"))
    for br in ("N", "S"):
        FAMILIES.append((f"halo-L{lp}-{br}", "earth-moon", {"family": "halo", "libr": lp, "branch": br},
                         f"L{lp} halo ({'northern' if br == 'N' else 'southern'})"))
    FAMILIES.append((f"vertical-L{lp}", "earth-moon", {"family": "vertical", "libr": lp}, f"L{lp} vertical Lyapunov"))
    FAMILIES.append((f"axial-L{lp}", "earth-moon", {"family": "axial", "libr": lp}, f"L{lp} axial"))
for lp in (4, 5):
    FAMILIES.append((f"short-L{lp}", "earth-moon", {"family": "short", "libr": lp}, f"L{lp} short-period"))
    FAMILIES.append((f"longp-L{lp}", "earth-moon", {"family": "longp", "libr": lp}, f"L{lp} long-period"))
    FAMILIES.append((f"vertical-L{lp}", "earth-moon", {"family": "vertical", "libr": lp}, f"L{lp} vertical"))
    FAMILIES.append((f"axial-L{lp}", "earth-moon", {"family": "axial", "libr": lp}, f"L{lp} axial"))
for br in ("N", "S"):
    FAMILIES.append((f"butterfly-{br}", "earth-moon", {"family": "butterfly", "branch": br}, f"Butterfly ({br})"))
    FAMILIES.append((f"dragonfly-{br}", "earth-moon", {"family": "dragonfly", "branch": br}, f"Dragonfly ({br})"))
FAMILIES += [
    ("dro", "earth-moon", {"family": "dro"}, "Distant retrograde (DRO)"),
    ("dpo", "earth-moon", {"family": "dpo"}, "Distant prograde (DPO)"),
    ("lpo-E", "earth-moon", {"family": "lpo", "branch": "E"}, "Low prograde (east)"),
    ("lpo-W", "earth-moon", {"family": "lpo", "branch": "W"}, "Low prograde (west)"),
]
for pq in ("11", "12", "13", "14", "21", "23", "31", "32", "34", "41", "43"):
    FAMILIES.append((f"resonant-{pq}", "earth-moon", {"family": "resonant", "branch": pq}, f"{pq[0]}:{pq[1]} resonant"))
for lp in (1, 2):
    for br in ("N", "S"):
        FAMILIES.append((f"se-halo-L{lp}-{br}", "sun-earth", {"family": "halo", "libr": lp, "branch": br},
                         f"Sun-Earth L{lp} halo ({br})"))
    FAMILIES.append((f"se-lyapunov-L{lp}", "sun-earth", {"family": "lyapunov", "libr": lp}, f"Sun-Earth L{lp} Lyapunov"))

FAMILY_INDEX = {k: (s, p, n) for k, s, p, n in FAMILIES}
SYSTEMS = {"earth-moon": EARTH_MOON, "sun-earth": SUN_EARTH}


@dataclass
class Family:
    key: str
    name: str
    system: System
    rows: np.ndarray  # columns: x y z vx vy vz jacobi period stability
    limits: dict = field(default_factory=dict)

    def __len__(self):
        return len(self.rows)

    def member(self, i: int) -> "Member":
        return Member(self, int(i) % len(self.rows))

    def nearest(self, col: str, value: float) -> "Member":
        c = {"x": 0, "z": 2, "jacobi": 6, "period": 7, "stability": 8}[col]
        return self.member(int(np.argmin(np.abs(self.rows[:, c] - value))))

    def nearest_period_days(self, days: float) -> "Member":
        return self.nearest("period", days / self.system.tunit_days)

    def sample(self, n: int) -> list["Member"]:
        idx = np.unique(np.linspace(0, len(self.rows) - 1, n).round().astype(int))
        return [self.member(i) for i in idx]


@dataclass
class Member:
    family: Family
    index: int

    @property
    def row(self):
        return self.family.rows[self.index]

    @property
    def state0(self):
        return self.row[:6]

    @property
    def period(self) -> float:
        return float(self.row[7])

    @property
    def period_days(self) -> float:
        return self.period * self.family.system.tunit_days

    @property
    def jacobi(self) -> float:
        return float(self.row[6])

    @property
    def stability(self) -> float:
        return float(self.row[8])

    def trajectory(self, n: int = 2000):
        return propagate(self.family.system.mu, self.state0, self.period, n=n)

    def metrics(self, n: int = 2000) -> dict:
        s = self.family.system
        t, X = self.trajectory(n)
        rP, rS = distances_km(s, X)
        return {
            "family": self.family.key, "index": self.index,
            "period_days": round(self.period_days, 3), "jacobi": round(self.jacobi, 6),
            "stability_index": round(self.stability, 4),
            "primary_min_km": round(float(rP.min())), "primary_max_km": round(float(rP.max())),
            "secondary_min_km": round(float(rS.min())), "secondary_max_km": round(float(rS.max())),
            "z_extent_km": round(float(np.ptp(X[2]) * s.lunit_km)),
            "closure_km": float(np.linalg.norm(X[:3, -1] - X[:3, 0]) * s.lunit_km),
        }


def _cache_file(key: str) -> Path:
    return CACHE / f"{key}.json.gz"


def fetch(key: str, timeout: int = 60) -> dict:
    sysname, params, _ = FAMILY_INDEX[key]
    q = "&".join(f"{k}={v}" for k, v in {"sys": sysname, **params}.items())
    with urllib.request.urlopen(f"{API}?{q}", timeout=timeout) as r:
        d = json.load(r)
    if "data" not in d:
        raise RuntimeError(f"{key}: {d.get('message', d)}")
    CACHE.mkdir(exist_ok=True)
    with gzip.open(_cache_file(key), "wt") as f:
        json.dump(d, f)
    return d


def refresh(keys=None) -> dict[str, int | str]:
    out = {}
    for k in keys or FAMILY_INDEX:
        try:
            out[k] = int(fetch(k).get("count", 0))
        except Exception as e:  # keep going; report per family
            out[k] = f"error: {e}"
    return out


def load(key: str) -> Family:
    if key not in FAMILY_INDEX:
        raise KeyError(f"unknown family {key!r}; see catalog.FAMILY_INDEX")
    p = _cache_file(key)
    d = json.load(gzip.open(p, "rt")) if p.exists() else fetch(key)
    sysname, _, name = FAMILY_INDEX[key]
    rows = np.array([[float(v) for v in r] for r in d["data"]])
    return Family(key, name, SYSTEMS[sysname], rows, d.get("limits", {}))


def available() -> list[str]:
    return [k for k in FAMILY_INDEX if _cache_file(k).exists()]
