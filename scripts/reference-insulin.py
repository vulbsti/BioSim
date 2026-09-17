"""Independent SciPy integration of the archived JSim no-feedback equations.

Copyright of source equations/code adaptation: University of Washington 1999–2010.
See models/sedaghat2002/source/sedaghat2002.mod for full retained notice.
This uses original M units internally and independently derives constants from
the source expressions, rather than consuming the browser's parameter JSON.
Run with work/p1/venv/bin/python scripts/reference-insulin.py.
"""
import hashlib
import json
from pathlib import Path
import platform
import numpy as np
import scipy
from scipy.integrate import solve_ivp

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / 'models/sedaghat2002/source/sedaghat2002.mod'
PROTOCOL = ROOT / 'validation/p1/protocol.json'
SCALE = np.array([1e12] * 12 + [1] * 9)
Y0 = np.array([9e-13, 0, 0, 0, 1e-13, 0, 0, 1e-12, 0, 0, 1e-13, 0, .31, 99.4, .29, 100, 0, 100, 0, 96, 4])


def derivative(t, y, insulin):
    # Native M and min. Keep derivation independent of TypeScript parameter table.
    rp, ri, ri2, rip, rc, ri2c, ripc, irs, irsp, irssp, pi3, complex_, pip3, pip2, pi34, akt, aktp, pkc, pkcp, glut, surf = y
    k1, k_1, k2, k_2, k3 = 6e7, .2, 6e7, 20, 2500
    k_3, k_4, k4, k44, k_44, k_5, k6 = .2, .003, .003/9, .0021, .00021, 1.67e-18, .461
    k5 = k_5 * (10 if rc + ri2c + ripc > 1e-13 else 60)
    k7, k_7, k_8 = 4.16, (2.5/7.45)*4.16, 10
    k8 = k_8*(5/70.775)*1e12
    k_9, k_10 = (94/3.1)*1.39, 2.77
    k9basal = (.31/99.4)*k_9
    k9 = (1.39-k9basal)*(complex_/5e-15)+k9basal
    k10 = (3.1/2.9)*k_10
    k_11 = k_12 = 10*np.log(2)
    k11, k12 = .1*k_11*(pip3-.31)/(3.10-.31), .1*k_12*(pip3-.31)/(3.10-.31)
    k_13, k_14 = .167, .001155
    k13, k14 = (4/96)*k_13, 96*k_14
    effect = (.2*aktp+.8*pkcp)/(100/11)
    k133 = (40/60-4/96)*k_13*effect
    drive = k7*irs*(ri2+rip)/8.97e-13
    return np.array([
        k_1*ri+k_3*rip-k1*insulin*rp+k_4*rc-k4*rp,
        k1*insulin*rp-k_1*ri-k3*ri,
        k2*insulin*rip-k_2*ri2+k_44*ri2c-k44*ri2,
        k3*ri+k_2*ri2-k2*insulin*rip-k_3*rip+k_44*ripc-k44*rip,
        k5-k_5*rc+k6*(ri2c+ripc)+k4*rp-k_4*rc,
        k44*ri2-k_44*ri2c-k6*ri2c,
        k44*rip-k_44*ripc-k6*ripc,
        k_7*irsp-drive,
        drive+k_8*complex_-(k_7+k8*pi3)*irsp,
        0,
        k_8*complex_-k8*irsp*pi3,
        k8*irsp*pi3-k_8*complex_,
        k9*pip2+k10*pi34-(k_9+k_10)*pip3,
        k_9*pip3-k9*pip2,
        k_10*pip3-k10*pi34,
        k_11*aktp-k11*akt,
        k11*akt-k_11*aktp,
        k_12*pkcp-k12*pkc,
        k12*pkc-k_12*pkcp,
        k_13*surf-(k13+k133)*glut+k14-k_14*glut,
        (k13+k133)*glut-k_13*surf,
    ])


def integrate(method):
    # Split the discontinuous input exactly; never ask an adaptive step to guess it.
    times = np.arange(0, 60.0001, .25)
    left = solve_ivp(lambda t, y: derivative(t, y, 1e-7), (0, 15), Y0,
                     method=method, t_eval=times[times <= 15], rtol=1e-10,
                     atol=np.array([1e-25]*12+[1e-11]*9), max_step=.1)
    if not left.success:
        raise RuntimeError(left.message)
    right = solve_ivp(lambda t, y: derivative(t, y, 0), (15, 60), left.y[:, -1],
                      method=method, t_eval=times[times > 15], rtol=1e-10,
                      atol=np.array([1e-25]*12+[1e-11]*9), max_step=.1)
    if not right.success:
        raise RuntimeError(right.message)
    return times, np.concatenate((left.y, right.y), axis=1).T * SCALE


if __name__ == '__main__':
    times, radau = integrate('Radau')
    _, bdf = integrate('BDF')
    threshold = json.loads(PROTOCOL.read_text())['sedaghat2002']['solverComparisonTolerance']
    normalized = np.abs(radau-bdf)/(threshold['absoluteInNativeUnits']+threshold['relative']*np.abs(radau))
    assert float(normalized.max()) < 1, 'Independent solver comparison exceeds predeclared tolerance'
    output = {
        'kind': 'computed-reference-not-experimental-data',
        'sourceSHA256': hashlib.sha256(SOURCE.read_bytes()).hexdigest(),
        'protocolSHA256': hashlib.sha256(PROTOCOL.read_bytes()).hexdigest(),
        'referenceScriptSHA256': hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
        'invocation': 'work/p1/venv/bin/python scripts/reference-insulin.py',
        'platform': {'python': platform.python_version(), 'scipy': scipy.__version__, 'numpy': np.__version__},
        'solver': {'method': 'Radau', 'crossCheck': 'BDF', 'rtol': 1e-10, 'atolM': 1e-25, 'atolPercentage': 1e-11, 'maximumStepMinutes': .1},
        'maximumCrossSolverNormalizedError': float(normalized.max()),
        'nativeStateUnits': 'First 12 states pM, remaining 9 percentage of initial pools',
        'samples': [{'time': float(t*60), 'state': state.tolist()} for t, state in zip(times, radau)],
    }
    target = ROOT/'validation/p1/insulin-reference.json'
    target.write_text(json.dumps(output, indent=2)+'\n')
    print(json.dumps({'output': str(target), 'samples': len(times), 'crossSolverNormalizedError': float(normalized.max()), 'surfaceGLUT4At15Min': float(radau[60,20]), 'surfaceGLUT4At60Min': float(radau[-1,20])}, indent=2))
