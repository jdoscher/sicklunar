"""The curated 'key orbits' list: one representative member per family, shared by the
drawings and every app. Selection rules live here so they are reproducible.
"""
from __future__ import annotations

from dataclasses import dataclass
from functools import lru_cache
from typing import Callable

import numpy as np

from . import catalog
from .cr3bp import distances_km

SYNODIC_MONTH_D = 29.530589


@dataclass(frozen=True)
class KeyOrbit:
    slug: str
    title: str
    family: str
    pick: Callable[[catalog.Family], catalog.Member]
    three_d: bool
    show_earth: bool = False
    lpts: tuple = ("L1", "L2")
    note: str = ""


def _scan(fam: catalog.Family, score, step_target: int = 400) -> catalog.Member:
    """Pick the member minimizing score(member, X) over an evenly spaced scan."""
    best, bs = None, float("inf")
    for i in range(0, len(fam), max(1, len(fam) // step_target)):
        m = fam.member(i)
        _, X = m.trajectory(600)
        s = score(m, X)
        if s < bs:
            best, bs = m, s
    return best


def _dro_artemis(fam):
    # far-side x-axis crossing ~70,000 km from the Moon (Artemis I: "about 40,000 miles beyond the Moon")
    mu = fam.system.mu
    return _scan(fam, lambda m, X: abs((X[0].max() - (1 - mu)) * fam.system.lunit_km - 70000))


def _tess(fam):
    # 2:1 resonant with ~108,000 km perigee (TESS: 17 x 59 Earth radii)
    return _scan(fam, lambda m, X: abs(distances_km(fam.system, X)[0].min() - 108000), 300)


def _jwst(fam):
    # max excursion from the ecliptic ~520,000 km (STScI JWST orbit page)
    return fam.member(int(np.argmin(np.abs(np.abs(fam.rows[:, 2]) * fam.system.lunit_km - 520000))))


KEY_ORBITS: list[KeyOrbit] = [
    KeyOrbit("05-l1-lyapunov", "L1 Lyapunov orbit (planar)", "lyapunov-L1", lambda f: f.nearest("jacobi", 3.10), False),
    KeyOrbit("06-l2-lyapunov", "L2 Lyapunov orbit (planar)", "lyapunov-L2", lambda f: f.nearest("jacobi", 3.10), False),
    KeyOrbit("07-l1-halo", "L1 halo orbit (northern)", "halo-L1-N", lambda f: f.nearest("jacobi", 3.08), True),
    KeyOrbit("08-l2-halo", "L2 halo orbit (southern)", "halo-L2-S", lambda f: f.nearest("jacobi", 3.10), True),
    KeyOrbit("09-nrho-9-2", "L2 southern NRHO, 9:2 resonant (Gateway / CAPSTONE)", "halo-L2-S",
             lambda f: f.nearest_period_days(SYNODIC_MONTH_D * 2 / 9), True),
    KeyOrbit("10-l1-vertical-lyapunov", "L1 vertical Lyapunov orbit (figure-eight)", "vertical-L1",
             lambda f: f.nearest("jacobi", 2.95), True),
    KeyOrbit("11-l1-axial", "L1 axial orbit", "axial-L1", lambda f: f.member(len(f) // 2), True),
    KeyOrbit("12-butterfly", "Butterfly orbit (northern)", "butterfly-N", lambda f: f.nearest("period", 3.0), True),
    KeyOrbit("13-dragonfly", "Dragonfly orbit (northern)", "dragonfly-N", lambda f: f.member(len(f) // 2), True),
    KeyOrbit("14-dro", "Distant retrograde orbit (DRO)", "dro", _dro_artemis, False),
    KeyOrbit("15-dpo", "Distant prograde orbit (DPO)", "dpo", lambda f: f.nearest("period", 2.0), False),
    KeyOrbit("16-low-prograde", "Low prograde orbit (LPO, planar, around the Moon)", "lpo-E",
             lambda f: f.nearest("period", 2.2), False),
    KeyOrbit("17-l4-short-period", "L4 short-period orbit", "short-L4", lambda f: f.nearest("jacobi", 2.95), False,
             True, ("L4", "L1", "L2", "L3", "L5")),
    KeyOrbit("18-l4-long-period", "L4 long-period orbit (tadpole-like)", "longp-L4", lambda f: f.nearest("jacobi", 2.99),
             False, True, ("L4", "L1", "L2", "L3", "L5")),
    KeyOrbit("19-resonant-2-1", "2:1 lunar-resonant Earth orbit (TESS-type, rotating frame)", "resonant-21", _tess,
             False, True, ("L1", "L2", "L4", "L5")),
    KeyOrbit("20-se-l2-halo", "Sun-Earth L2 halo orbit (JWST-type, Terran space)", "se-halo-L2-N", _jwst, True,
             False, ("L2",), "'Moon' circle here is Earth."),
]
BY_SLUG = {k.slug: k for k in KEY_ORBITS}


@lru_cache(maxsize=None)
def member(slug: str) -> catalog.Member:
    k = BY_SLUG[slug]
    return k.pick(catalog.load(k.family))
