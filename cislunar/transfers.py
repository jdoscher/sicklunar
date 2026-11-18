"""Earth-to-destination transfers for the kids' mission planner, computed in the CR3BP.

Every transfer starts with a tangential burn (trans-lunar injection, TLI) from a circular
185 km parking orbit around Earth and ends either

* by matching a periodic target orbit (DRO, NRHO, halos, L4) with one insertion burn, or
* at a 100 km perilune over the Moon, circularized into low lunar orbit (LLO), or
* back at Earth (free return), with no burn after TLI.

The parking orbit may be tilted relative to the Earth-Moon plane: the departure point and
velocity are free, which is what a real launch does by picking its time and direction.
Results are cached in JSON for the web app (see export_missions()).
"""
from __future__ import annotations

import json
import math
from dataclasses import dataclass

import numpy as np
from scipy.integrate import solve_ivp
from scipy.optimize import minimize
from scipy.spatial import cKDTree

from .cr3bp import EARTH_MOON as EM, eom
from . import key_orbits

MU = EM.mu
L = EM.lunit_km
TU = EM.tunit_s
VU = L / TU  # km/s per nondim velocity
DAY = 86400 / TU
E = np.array([-MU, 0.0, 0.0])
M = np.array([1 - MU, 0.0, 0.0])
R_EARTH = 6378.137 / L
R_MOON = 1737.4 / L
R_LEO = (6378.137 + 185) / L
R_LLO = (1737.4 + 100) / L
R_ENTRY = (6378.137 + 122) / L  # entry interface

_F = eom(MU)


def omega_cross(a):
    return np.array([-a[1], a[0], 0.0])


def v_inertial_rel(pos, vel, center):
    """Inertial velocity relative to a body at `center`, expressed in rotating-frame axes."""
    return vel + omega_cross(pos - center)


def v_rot_from_inertial(pos, v_in, center):
    return v_in - omega_cross(pos - center)


def circ_speed(r, gm):
    return math.sqrt(gm / r)


def prop(s0, t, n=0, events=None, rtol=1e-10, atol=1e-11, dense=False):
    return solve_ivp(_F, (0.0, t), s0, rtol=rtol, atol=atol, method="DOP853", events=events,
                     dense_output=dense, t_eval=np.linspace(0, t, n) if n else None)


def leo_state(alpha, elev, dv):
    """Perigee state after a tangential TLI from a circular LEO.

    alpha: angle of the departure point around Earth in the Earth-Moon plane (0 = toward Moon).
    elev: tilt of the velocity out of the plane (rad); the parking orbit plane is then tilted.
    dv: TLI magnitude (nondim)."""
    r = R_LEO * np.array([math.cos(alpha), math.sin(alpha), 0.0])
    t_hat = np.array([-math.sin(alpha), math.cos(alpha), 0.0])
    z = np.array([0.0, 0.0, 1.0])
    v_dir = math.cos(elev) * t_hat + math.sin(elev) * z
    v_in = (circ_speed(R_LEO, 1 - MU) + dv) * v_dir
    pos = E + r
    return np.concatenate([pos, v_rot_from_inertial(pos, v_in, E)])


def _hit(center, radius):
    def ev(t, s):
        return np.linalg.norm(s[:3] - center) - radius
    ev.terminal = True
    return ev


def _perilune_event(t, s):
    d = s[:3] - M
    if np.linalg.norm(d) > 40000 / L:  # only count close passes
        return -1.0
    return float(np.dot(d, s[3:6]))  # radial velocity relative to the Moon: - approaching, + receding


_perilune_event.direction = 1  # from approaching (-) to receding (+)


def _perigee_event(t, s):
    d = s[:3] - E
    return float(np.dot(d, s[3:6]))


_perigee_event.direction = 1


# ---------------------------------------------------------------- periodic targets
@dataclass
class Target:
    slug: str
    P: float
    t: np.ndarray
    X: np.ndarray  # 6 x n
    tree: cKDTree
    sol: object  # dense output over one period


def target(slug: str, n: int = 4000) -> Target:
    m = key_orbits.member(slug)
    sol = solve_ivp(_F, (0.0, m.period), m.state0, rtol=1e-12, atol=1e-12, method="DOP853", dense_output=True)
    t = np.linspace(0, m.period, n)
    X = sol.sol(t)
    return Target(slug, m.period, t, X, cKDTree(X[:3].T), sol)


def scan_forward(tg: Target, days: float, elevs, dvs_kms, alphas_deg, w_vel: float = 1.0, top: int = 12):
    """Coarse forward scan from LEO; score = closest approach to the target orbit combining
    position miss and velocity mismatch. Returns best candidates."""
    out = []
    for elev in elevs:
        for dv in dvs_kms:
            for a in alphas_deg:
                s0 = leo_state(math.radians(a), math.radians(elev), dv / VU)
                sol = prop(s0, days * DAY, n=500, events=[_hit(E, R_EARTH), _hit(M, R_MOON)], rtol=1e-8, atol=1e-9)
                P = sol.y[:3].T
                if len(P) < 20:
                    continue
                d, idx = tg.tree.query(P)
                vm = np.linalg.norm(sol.y[3:6].T - tg.X[3:6, idx].T, axis=1)
                score = d * 10 + w_vel * vm
                k = int(np.argmin(score[20:])) + 20  # skip the Earth departure region
                out.append((float(score[k]), a, elev, dv, float(sol.t[k]), float(tg.t[idx[k]]), float(d[k] * L), float(vm[k] * VU)))
    out.sort()
    return out[:top]


def refine_target(tg: Target, cand, max_days: float):
    """Backward shooting from an insertion point on the target orbit to a LEO perigee.

    x = [tau (target time), dvx, dvy, dvz (insertion burn), T (flight time)]
    constraints at the LEO end: |r| = R_LEO and r.v = 0 (tangential departure)."""
    _, a, elev, dv, t_arr, tau, _, _ = cand
    # velocity mismatch at the candidate gives the initial insertion burn
    s0 = leo_state(math.radians(a), math.radians(elev), dv / VU)
    sol = prop(s0, t_arr, n=2)
    st_t = tg_state(tg, tau)
    dv0 = st_t[3:] - sol.y[3:6, -1]

    def back(x):
        tau_, dvx, dvy, dvz, T = x
        s = tg_state(tg, tau_)
        s[3:] -= np.array([dvx, dvy, dvz])
        return back_to_leo(s, T)

    def cons(x):
        s = back(x)
        r = s[:3] - E
        v = v_inertial_rel(s[:3], s[3:], E)
        return np.array([np.linalg.norm(r) / R_LEO - 1.0, np.dot(r, v) / (np.linalg.norm(r) * np.linalg.norm(v))])

    def cost(x):
        s = back(x)
        v = np.linalg.norm(v_inertial_rel(s[:3], s[3:], E))
        return (v - circ_speed(R_LEO, 1 - MU)) + np.linalg.norm(x[1:4])

    x0 = np.array([tau, *dv0, t_arr])
    res = minimize(cost, x0, method="SLSQP", constraints=[{"type": "eq", "fun": cons}],
                   bounds=[(None, None), (-1, 1), (-1, 1), (-1, 1), (0.5 * DAY, max_days * DAY)],
                   options={"maxiter": 200, "ftol": 1e-9})
    return res, back


def tg_state(tg: Target, tau: float) -> np.ndarray:
    return np.asarray(tg.sol.sol(tau % tg.P)).copy()


# ---------------------------------------------------------------- LLO and free return
def perilune_after(s0, days):
    sol = prop(s0, days * DAY, events=[_hit(E, R_EARTH * 0.999), _hit(M, R_MOON * 0.999), _perilune_event])
    ev = sol.t_events[2]
    if len(ev) == 0:
        return None
    s = sol.y_events[2][0]
    return float(ev[0]), s


def refine_llo(a0, elev0, dv0, days=6.0):
    """Forward shooting: choose departure angle, plane tilt and TLI so the first perilune is
    100 km above the Moon; minimize TLI + LOI (circularize at perilune)."""
    def run(x):
        a, elev, dv = x
        s0 = leo_state(a, elev, dv)
        return s0, perilune_after(s0, days)

    def cons(x):
        _, p = run(x)
        if p is None:
            return -1.0
        return (np.linalg.norm(p[1][:3] - M) - R_LLO) / R_LLO

    def cost(x):
        s0, p = run(x)
        if p is None:
            return 10.0
        v = np.linalg.norm(v_inertial_rel(p[1][:3], p[1][3:], M))
        return x[2] + (v - circ_speed(R_LLO, MU))

    res = minimize(cost, np.array([a0, elev0, dv0]), method="SLSQP", constraints=[{"type": "eq", "fun": cons}],
                   options={"maxiter": 200, "ftol": 1e-12})
    return res, run


def refine_free_return(a0, dv0, max_days=12.0):
    """Planar free return: after TLI, fly around the Moon and come back to Earth with perigee at
    the entry interface; no burns after TLI. Minimize TLI."""
    def run(x):
        a, dv = x
        s0 = leo_state(a, 0.0, dv)
        sol = prop(s0, max_days * DAY, events=[_hit(E, R_ENTRY), _hit(M, R_MOON)], n=0, dense=True)
        return s0, sol

    def cons(x):
        _, sol = run(x)
        if len(sol.t_events[1]):
            return -1.0
        t = np.linspace(0.5 * DAY, sol.t[-1], 3000)
        Y = sol.sol(t)
        rE = np.linalg.norm(Y[:3].T - E, axis=1)
        # first Earth closest approach after the lunar flyby
        rM = np.linalg.norm(Y[:3].T - M, axis=1)
        k_moon = int(np.argmin(rM))
        if rM[k_moon] > 0.2:
            return -1.0
        after = rE[k_moon:]
        return (after.min() - R_ENTRY) / R_ENTRY

    res = minimize(lambda x: x[1], np.array([a0, dv0]), method="SLSQP",
                   constraints=[{"type": "eq", "fun": cons}], options={"maxiter": 200, "ftol": 1e-12})
    return res, run


def arrival_state_moon(x):
    """Perilune state 100 km above the Moon from x = [theta, phi, psi, speed]:
    theta/phi place the point on the sphere, psi turns the velocity within the local horizontal,
    speed is the inertial speed relative to the Moon."""
    th, ph, psi, sp = x
    u = np.array([math.cos(ph) * math.cos(th), math.cos(ph) * math.sin(th), math.sin(ph)])
    e1 = np.array([-math.sin(th), math.cos(th), 0.0])
    e2 = np.cross(u, e1)
    vdir = math.cos(psi) * e1 + math.sin(psi) * e2
    pos = M + R_LLO * u
    return np.concatenate([pos, v_rot_from_inertial(pos, sp * vdir, M)])


def back_to_leo(s_arr, T):
    b = solve_ivp(_F, (0.0, -T), s_arr, rtol=1e-9, atol=1e-10, method="DOP853",
                  events=[_hit(E, R_EARTH * 0.98)])
    return b.y[:, -1]


def leo_end_constraints(s):
    r = s[:3] - E
    v = v_inertial_rel(s[:3], s[3:], E)
    return np.array([np.linalg.norm(r) / R_LEO - 1.0, np.dot(r, v) / (np.linalg.norm(r) * np.linalg.norm(v))])


def tli_of(s):
    return np.linalg.norm(v_inertial_rel(s[:3], s[3:], E)) - circ_speed(R_LEO, 1 - MU)


def lunar_incl_cos(x):
    """cos(inclination) of the orbit at the perilune state x[:4], relative to the Earth-Moon plane
    (0 = polar). The Moon's equator is within 6.7 deg of that plane."""
    s = arrival_state_moon(x[:4])
    r = s[:3] - M
    h = np.cross(r, v_inertial_rel(s[:3], s[3:], M))
    return h[2] / np.linalg.norm(h)


def refine_llo_back(x0, T0, tmin_days=2.5, tmax_days=5.5, polar=False):
    """Backward shooting from a 100 km perilune to a tangential LEO departure.
    x = [theta, phi, psi, speed, T]; minimize TLI + LOI. polar=True adds an inclination-90 constraint."""
    def cost(x):
        s = back_to_leo(arrival_state_moon(x[:4]), x[4])
        return tli_of(s) + (x[3] - circ_speed(R_LLO, MU))

    def cons(x):
        c = leo_end_constraints(back_to_leo(arrival_state_moon(x[:4]), x[4]))
        return np.append(c, lunar_incl_cos(x)) if polar else c

    res = minimize(cost, np.array([*x0, T0]), method="SLSQP", constraints=[{"type": "eq", "fun": cons}],
                   bounds=[(None, None), (-1.5, 1.5), (None, None), (0.5 / VU, 4 / VU), (tmin_days * DAY, tmax_days * DAY)],
                   options={"maxiter": 200, "ftol": 1e-9})
    return res


def moon_guess_from_state(s):
    """Turn a near-Moon state into [theta, phi, psi, speed] for arrival_state_moon."""
    d = s[:3] - M
    u = d / np.linalg.norm(d)
    th = math.atan2(u[1], u[0]); ph = math.asin(max(-1, min(1, u[2])))
    v = v_inertial_rel(s[:3], s[3:], M)
    e1 = np.array([-math.sin(th), math.cos(th), 0.0]); e2 = np.cross(u, e1)
    vt = v - np.dot(v, u) * u
    psi = math.atan2(np.dot(vt, e2), np.dot(vt, e1))
    # energy-conserving speed at R_LLO (two-body around the Moon)
    eps = 0.5 * np.dot(v, v) - MU / np.linalg.norm(d)
    sp = math.sqrt(max(2 * (eps + MU / R_LLO), 1e-6))
    return [th, ph, psi, sp]


# ---------------------------------------------------------------- export
def _resample(t, Y, n=600):
    P = Y[:3].T
    seg = np.linalg.norm(np.diff(P, axis=0), axis=1)
    s = np.concatenate([[0], np.cumsum(seg)])
    # arc-length spacing plus a floor on time spacing so slow parts still get samples
    u = s / s[-1] + (t - t[0]) / (t[-1] - t[0])
    idx = np.unique(np.searchsorted(u, np.linspace(0, u[-1], n)).clip(0, len(t) - 1))
    idx = np.unique(np.concatenate([idx, [0, len(t) - 1]]))
    return [round(float(x), 6) for x in t[idx]], np.round(P[idx], 6).tolist()


def dense_path(s0, T, n=6000):
    sol = prop(s0, T, n=n)
    return sol.t, sol.y
