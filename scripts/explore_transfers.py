"""Exploration: LLO transfer via backward shooting."""
import math, time
import numpy as np
from cislunar.transfers import *

t0 = time.time()
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
print("scan", round(time.time() - t0, 1), "s", len(cands), [(round(c[0]), c[1], round(c[2], 2), round(c[3] / DAY, 2)) for c in cands[:5]])
best = None
for c in cands[:3]:
    t1=time.time(); res = refine_llo_back(moon_guess_from_state(c[4]), c[3]); print("  took", round(time.time()-t1,1), res.nit, res.message, flush=True)
    s = back_to_leo(arrival_state_moon(res.x[:4]), res.x[4])
    con = leo_end_constraints(s)
    tli = tli_of(s) * VU; loi = (res.x[3] - circ_speed(R_LLO, MU)) * VU
    print(res.success, "TLI %.3f LOI %.3f T %.2f d  con %s" % (tli, loi, res.x[4] / DAY, np.round(con, 6)))
    if res.success and np.abs(con).max() < 1e-6 and (best is None or res.fun < best.fun):
        best = res
print("best", best.fun * VU if best is not None else None, round(time.time() - t0, 1))
