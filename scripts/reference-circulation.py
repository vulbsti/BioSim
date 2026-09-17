"""Independent DOP853 reference; native physical insulin amounts here are pmol.

No TypeScript exports or trajectory samples are consumed. Source signaling uses
the already independently transcribed P1 equations, with explicit unit conversion.
This is a numerical reference for synthetic parameters, not human observations.
"""
import hashlib
import importlib.util
import json
import platform
from pathlib import Path
import numpy as np
import scipy
from scipy.integrate import solve_ivp

ROOT=Path(__file__).resolve().parent.parent
spec=importlib.util.spec_from_file_location('insulin_reference',ROOT/'scripts/reference-insulin.py')
insulin=importlib.util.module_from_spec(spec)
spec.loader.exec_module(insulin)
v0=np.array([.7,2.7,.25,.35,.15,.4,.1,.15,.1,.1])
p0=np.array([95,5,15,8,30,25,25,25,12,8])
compliance=np.array([.0013,.08,.01,.02,.0015,.004,.002,.003,.006,.005])
# from, to, baseline whole-blood L/min; left/right pump slots separate below.
branches=[(2,3,5),(0,4,1),(4,1,1),(0,5,1.65),(5,1,1.65),(0,6,1.2),(6,1,1.2),(0,7,.8),(7,8,.8),(8,9,.8),(0,9,.35),(9,1,1.15)]
routes=[(a,b,(p0[a]-p0[b])/(q/60)) for a,b,q in branches]

def derivative(t,y,source):
    dy=np.zeros(46)
    pressure=p0+(y[:10]-v0)/compliance
    phase=(t*72/60)%1
    pump=(5/60)*np.pi/(2*.32)*np.sin(np.pi*phase/.32) if phase<.32 else 0
    flows=[(3,0,pump),(1,2,pump)]+[(a,b,(pressure[a]-pressure[b])/r) for a,b,r in routes]
    for a,b,q in flows:
        if q<0:
            a,b,q=b,a,-q
        rate=q*.55*(y[10+a]/(y[a]*.55))
        dy[a]-=q;dy[b]+=q;dy[10+a]-=rate;dy[10+b]+=rate
    plasma=y[10:20]/(y[:10]*.55)
    tissue=y[20]/.5
    exchange=.08/60*(plasma[4]-tissue)
    dy[14]-=exchange;dy[20]+=exchange
    liver=.35/60*plasma[9];kidney=.18/60*plasma[6];muscle=.04/60*tissue
    dy[19]-=liver;dy[21]+=liver;dy[16]-=kidney;dy[22]+=kidney;dy[20]-=muscle;dy[23]+=muscle
    if source:
        dy[18]+=1200/20;dy[24]+=1200/20
    dy[25:]=insulin.derivative(t/60,y[25:]/insulin.SCALE,tissue*1e-12)*insulin.SCALE/60
    return dy

if __name__=='__main__':
    current=np.concatenate((v0,np.zeros(15),insulin.Y0*insulin.SCALE))
    states=[current.copy()];times=[0.0];evaluations=0
    for start,end,source in [(0,5,False),(5,25,True),(25,600,False)]:
        points=np.arange(start+.5,end+.001,.5)
        answer=solve_ivp(lambda t,y:derivative(t,y,source),(start,end),current,
            method='DOP853',t_eval=points,rtol=1e-10,atol=np.array([1e-12]*10+[1e-9]*15+[1e-12]*21),max_step=.05)
        if not answer.success:
            raise RuntimeError(answer.message)
        current=answer.y[:,-1];states.extend(answer.y.T);times.extend(points);evaluations+=answer.nfev
    samples=[]
    for t,y in zip(times,states):
        samples.append({'time':float(t),'volumesL':y[:10].tolist(),'pressureMmHg':(p0+(y[:10]-v0)/compliance).tolist(),
          'insulinPM':(y[10:20]/(y[:10]*.55)).tolist(),'interstitialPM':float(y[20]/.5),'signal':y[25:].tolist(),
          'clearedPmol':y[21:24].tolist(),'injectedPmol':float(y[24])})
    sources=['scripts/reference-circulation.py','scripts/reference-insulin.py','validation/p3/protocol.json','models/sedaghat2002/source/sedaghat2002.mod']
    receipt={'schemaVersion':1,'evidence':'Independent computed numerical reference; not biological validation.',
      'invocation':'work/p1/venv/bin/python scripts/reference-circulation.py','platform':{'python':platform.python_version(),'scipy':scipy.__version__,'numpy':np.__version__},
      'solver':{'method':'DOP853','rtol':1e-10,'atolVolumeL':1e-12,'atolPhysicalInsulinPmol':1e-9,'atolNativeSignaling':1e-12,'maximumStepSeconds':.05,'evaluations':evaluations},
      'sourceHashes':{p:hashlib.sha256((ROOT/p).read_bytes()).hexdigest() for p in sources},'samples':samples}
    (ROOT/'validation/p3/circulation-reference.json').write_text(json.dumps(receipt,indent=2)+'\n')
    print(json.dumps({'samples':len(samples),'evaluations':evaluations,'receipt':'validation/p3/circulation-reference.json'}))
