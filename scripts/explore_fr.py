import math, time
import numpy as np
from cislunar.transfers import *
from cislunar.transfers import _hit
t0=time.time()
best=[]
for dv in np.arange(3.10, 3.20, 0.005):
    for a in range(180, 300, 2):
        s0 = leo_state(math.radians(a), 0.0, dv / VU)
        sol = prop(s0, 12 * DAY, events=[_hit(E, R_ENTRY), _hit(M, R_MOON)], n=1500)
        if len(sol.t_events[1]): continue
        P=sol.y[:3].T; rM=np.linalg.norm(P-M,axis=1); k=int(np.argmin(rM))
        if rM[k]*L > 15000: continue
        rE=np.linalg.norm(P[k:]-E,axis=1)
        best.append((abs(rE.min()*L-6500), a, round(dv,3), round(rM[k]*L-1737), round(sol.t[-1]/DAY,2)))
best.sort(); print(round(time.time()-t0,1), best[:6], flush=True)
_, a, dv, _, _ = best[0]
res, run = refine_free_return(math.radians(a), dv / VU)
s0, sol = run(res.x)
t = np.linspace(0, sol.t[-1], 20000); Y = sol.sol(t)
rM = np.linalg.norm(Y[:3].T - M, axis=1); rE = np.linalg.norm(Y[:3].T - E, axis=1)
k = int(np.argmin(rM))
print(res.success, res.message, "TLI %.4f" % (res.x[1] * VU), "perilune alt %.0f km" % (rM[k] * L - 1737.4), "return perigee %.0f km" % (rE[k:].min() * L), "days to perilune %.2f total %.2f" % (t[k] / DAY, t[k + int(np.argmin(rE[k:]))] / DAY))
