import math

import numpy as np
import pytest

from cislunar import catalog, key_orbits
from cislunar.cr3bp import EARTH_MOON, SUN_EARTH, jacobi, lagrange_points, propagate

# JPL API published Lagrange points (Earth-Moon system block)
JPL_EM = {"L1": 0.836915125772357, "L2": 1.15568216544488, "L3": -1.00506264581028, "L4x": 0.487849414390376}


def test_lagrange_points_match_jpl():
    L = lagrange_points(EARTH_MOON.mu)
    assert L["L1"][0] == pytest.approx(JPL_EM["L1"], abs=1e-9)
    assert L["L2"][0] == pytest.approx(JPL_EM["L2"], abs=1e-9)
    assert L["L3"][0] == pytest.approx(JPL_EM["L3"], abs=1e-9)
    assert L["L4"][0] == pytest.approx(JPL_EM["L4x"], abs=1e-9)
    assert L["L4"][1] == pytest.approx(math.sqrt(3) / 2)


def test_jacobi_conserved_and_matches_catalog():
    m = catalog.load("halo-L2-S").nearest_period_days(6.56)
    _, X = propagate(EARTH_MOON.mu, m.state0, m.period, n=200)
    C = jacobi(EARTH_MOON.mu, X.T)
    assert np.ptp(C) < 1e-9
    assert C[0] == pytest.approx(m.jacobi, abs=1e-8)


def test_cache_complete():
    assert set(catalog.available()) == set(catalog.FAMILY_INDEX)


@pytest.mark.parametrize("slug", [k.slug for k in key_orbits.KEY_ORBITS])
def test_key_orbits_close(slug):
    met = key_orbits.member(slug).metrics(800)
    assert met["closure_km"] < 0.1


def test_nrho_matches_nasa_ballpark():
    # NASA: ~6.5 d period, perilune ~3,200-3,560 km, apolune ~70,000-71,800 km (ephemeris model)
    met = key_orbits.member("09-nrho-9-2").metrics()
    assert 6.4 < met["period_days"] < 6.7
    assert 2500 < met["secondary_min_km"] < 3700
    assert 69000 < met["secondary_max_km"] < 73000


def test_sun_earth_system():
    L = lagrange_points(SUN_EARTH.mu)
    d_km = (L["L2"][0] - (1 - SUN_EARTH.mu)) * SUN_EARTH.lunit_km
    assert 1.4e6 < d_km < 1.6e6
