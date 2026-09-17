"""Independent integration of PMR's archived Python equations with SciPy BDF.
The browser mechanically translates the separate C export and uses explicit DP54.
Source model: Shorten et al. 2007 fast-twitch mouse muscle; CC BY 3.0.
"""
from pathlib import Path
import importlib.util, json, hashlib, time
import numpy as np
import scipy
from scipy.integrate import solve_ivp
ROOT=Path(__file__).resolve().parents[1]
path=ROOT/'models/shorten2007/source/shorten2007.py'
spec=importlib.util.spec_from_file_location('archived_shorten',path)
model=importlib.util.module_from_spec(spec);spec.loader.exec_module(model)
OUT=ROOT/'validation/p5';OUT.mkdir(parents=True,exist_ok=True)
results=[]
for name,stimulus,release in [('single','single',1),('train','train',1),('no-stimulus','none',1),('blocked-release','single',0)]:
    started=time.monotonic();y,c=model.initConsts();c[98]*=release
    samples=[{'timeMs':0,'state':list(y)}];calls=0
    # Split pulse boundaries but avoid forcing BDF restarts at every output sample.
    pulses=([0] if stimulus=='single' else list(range(0,401,50)) if stimulus=='train' else [])
    boundaries=sorted(set([0.,500.]+[float(v) for p in pulses for v in [p,p+.5]]))
    for start,end in zip(boundaries,boundaries[1:]):
        current=150. if any(p<=(start+end)/2<p+.5 for p in pulses) else 0.
        def rhs(t,state):
            rates=model.computeRates(-1,state,c);rates[0]+=current/c[0];return rates
        times=np.arange(start+.5,end+.01,.5)
        sol=solve_ivp(rhs,(start,end),y,method='BDF',rtol=2e-9,atol=1e-11,t_eval=times,max_step=.5)
        if not sol.success:raise RuntimeError(sol.message)
        calls+=sol.nfev;y=sol.y[:,-1]
        samples.extend({'timeMs':float(t),'state':s.tolist()} for t,s in zip(sol.t,sol.y.T))
    results.append({'name':name,'config':{'stimulus':stimulus,'releaseScale':release},'samples':samples,'rhsCalls':calls,'wallSeconds':time.monotonic()-started})
    print(name,'complete',calls,round(time.monotonic()-started,2),flush=True)
receipt={'sourceSHA256':hashlib.sha256(path.read_bytes()).hexdigest(),'solver':'SciPy BDF','scipy':scipy.__version__,'rtol':2e-9,'atol':1e-11,'results':results,'evidence':'Independent numerical comparison, not independent biological validation'}
(OUT/'excitation-reference.json').write_text(json.dumps(receipt,separators=(',',':'))+'\n')
