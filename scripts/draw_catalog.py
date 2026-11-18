"""Regenerate the key-orbit line drawings. Usage: python scripts/draw_catalog.py [OUT_DIR]

OUT_DIR defaults to $SICKLUNAR_DRAWINGS_DIR, or ./drawings.
"""
import os
import sys

from cislunar.draw import draw_key_orbits

out = sys.argv[1] if len(sys.argv) > 1 else os.environ.get("SICKLUNAR_DRAWINGS_DIR", "drawings")
stats = draw_key_orbits(out)
for k, v in stats.items():
    print(k, v.get("period_days"), "d", "closure_km", v.get("closure_km"))
print("wrote", out)
