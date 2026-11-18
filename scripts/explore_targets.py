"""Exploration: transfers to periodic target orbits."""
import math, sys, time
import numpy as np
from cislunar.transfers import *

slug = sys.argv[1]; days = float(sys.argv[2]); elevs = [int(e) for e in sys.argv[3].split(",")]
t0 = time.time()
tg = target(slug)
cands = scan_forward(tg, days, elevs, np.arange(3.06, 3.22, 0.02), range(0, 360, 4), top=6)
print(slug, "scan", round(time.time() - t0, 1), "s", [(round(c[0], 3), c[1], c[2], round(c[3], 2), round(c[4] / DAY, 1), round(c[6]), round(c[7], 2)) for c in cands], flush=True)
for c in cands[:4]:
    t1 = time.time()
    res, back = refine_target(tg, c, days * 1.3)
    s = back(res.x)
    con = leo_end_constraints(s)
    print("  ", res.success, "TLI %.3f INS %.3f T %.2f d con %s  %.1fs" % (tli_of(s) * VU, np.linalg.norm(res.x[1:4]) * VU, res.x[4] / DAY, np.round(con, 6), time.time() - t1), flush=True)
