"""Circular restricted three-body problem (CR3BP) core: dynamics, propagation, invariants.

Units are the standard nondimensional ones: distance = Earth-Moon distance (lunit),
time = 1/mean motion (tunit, so one sidereal month = 2*pi). Frame rotates with the
primaries; Earth sits at (-mu, 0, 0), Moon at (1 - mu, 0, 0).
"""
from __future__ import annotations

import math
from dataclasses import dataclass

import numpy as np
from scipy.integrate import solve_ivp


@dataclass(frozen=True)
class System:
    name: str
    mu: float
    lunit_km: float
    tunit_s: float
    r_primary_km: float
    r_secondary_km: float

    @property
    def tunit_days(self) -> float:
        return self.tunit_s / 86400.0

    @property
    def vunit_kms(self) -> float:
        return self.lunit_km / self.tunit_s

    def primary(self) -> np.ndarray:
        return np.array([-self.mu, 0.0, 0.0])

    def secondary(self) -> np.ndarray:
        return np.array([1.0 - self.mu, 0.0, 0.0])


# Constants as published by the NASA/JPL Three-Body Periodic Orbits API.
EARTH_MOON = System("Earth-Moon", 1.215058560962404e-02, 389703.264829278, 382981.289129055, 6378.137, 1737.1)
SUN_EARTH = System("Sun-Earth", 3.054200000000000e-06, 149597870.7, 5022635.34820215, 695700.0, 6378.0)


def eom(mu: float):
    """Right-hand side of the CR3BP equations of motion."""
    def f(_t, s):
        x, y, z, vx, vy, vz = s
        r1 = math.sqrt((x + mu) ** 2 + y * y + z * z)
        r2 = math.sqrt((x - 1 + mu) ** 2 + y * y + z * z)
        r13, r23 = r1 ** 3, r2 ** 3
        ax = 2 * vy + x - (1 - mu) * (x + mu) / r13 - mu * (x - 1 + mu) / r23
        ay = -2 * vx + y - (1 - mu) * y / r13 - mu * y / r23
        az = -(1 - mu) * z / r13 - mu * z / r23
        return [vx, vy, vz, ax, ay, az]
    return f


def jacobi(mu: float, s) -> np.ndarray:
    """Jacobi constant C = 2U - v^2 (higher C = less energy)."""
    s = np.asarray(s, dtype=float)
    x, y, z, vx, vy, vz = s[..., 0], s[..., 1], s[..., 2], s[..., 3], s[..., 4], s[..., 5]
    r1 = np.sqrt((x + mu) ** 2 + y ** 2 + z ** 2)
    r2 = np.sqrt((x - 1 + mu) ** 2 + y ** 2 + z ** 2)
    U = 0.5 * (x ** 2 + y ** 2) + (1 - mu) / r1 + mu / r2
    return 2 * U - (vx ** 2 + vy ** 2 + vz ** 2)


def propagate(mu: float, state0, t_end: float, n: int = 2000, rtol: float = 1e-12, atol: float = 1e-12):
    """Propagate a state for t_end (nondim). Returns (t[n], X[6, n])."""
    sol = solve_ivp(eom(mu), (0.0, t_end), np.asarray(state0, float), rtol=rtol, atol=atol,
                    dense_output=True, method="DOP853")
    if not sol.success:
        raise RuntimeError(sol.message)
    t = np.linspace(0.0, t_end, n)
    return t, sol.sol(t)


def lagrange_points(mu: float) -> dict[str, np.ndarray]:
    """Positions of L1-L5 (collinear points solved by Newton iteration)."""
    def dUx(x):
        r1, r2 = abs(x + mu), abs(x - 1 + mu)
        return x - (1 - mu) * (x + mu) / r1 ** 3 - mu * (x - 1 + mu) / r2 ** 3

    def newton(x):
        for _ in range(100):
            h = 1e-7
            d = (dUx(x + h) - dUx(x - h)) / (2 * h)
            step = dUx(x) / d
            x -= step
            if abs(step) < 1e-15:
                break
        return x

    g = (mu / 3) ** (1 / 3)
    return {
        "L1": np.array([newton(1 - mu - g), 0, 0]),
        "L2": np.array([newton(1 - mu + g), 0, 0]),
        "L3": np.array([newton(-1 - 5 * mu / 12), 0, 0]),
        "L4": np.array([0.5 - mu, math.sqrt(3) / 2, 0]),
        "L5": np.array([0.5 - mu, -math.sqrt(3) / 2, 0]),
    }


def distances_km(sysm: System, X: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """Distance from primary and secondary (km) along a trajectory X[6, n]."""
    rP = np.linalg.norm(X[:3].T - sysm.primary(), axis=1) * sysm.lunit_km
    rS = np.linalg.norm(X[:3].T - sysm.secondary(), axis=1) * sysm.lunit_km
    return rP, rS


def to_inertial(sysm: System, t: np.ndarray, X: np.ndarray, center: str = "primary") -> np.ndarray:
    """Rotate a rotating-frame trajectory into the inertial frame centered on a body (km)."""
    c = sysm.primary() if center == "primary" else sysm.secondary()
    p = X[:3].T - c
    ct, st = np.cos(t), np.sin(t)
    out = np.empty_like(p)
    out[:, 0] = ct * p[:, 0] - st * p[:, 1]
    out[:, 1] = st * p[:, 0] + ct * p[:, 1]
    out[:, 2] = p[:, 2]
    return out * sysm.lunit_km
