"""Independent SciPy integration of the beta-cell secretion equations declared in
models/dallaman2007/parameters.json and validation/p4/beta-cell-protocol.json.

This does NOT import or execute app/simulation/beta-cell.ts; it re-derives the ODE
right-hand side directly from the protocol's scenario formulas and the parameter
file, so it is an independent cross-check of the TypeScript integrator, not a
verification of the underlying published model (see models/dallaman2007/README.md
for what is and is not verified about the model itself).

Run with work/p1/venv/bin/python scripts/reference-beta-cell.py.
"""
import hashlib
import json
import platform
from pathlib import Path

import numpy as np
import scipy
from scipy.integrate import solve_ivp

ROOT = Path(__file__).resolve().parent.parent
PARAMS_PATH = ROOT / 'models/dallaman2007/parameters.json'
PROTOCOL_PATH = ROOT / 'validation/p4/beta-cell-protocol.json'
OUTPUT_PATH = ROOT / 'validation/p4/beta-cell-reference.json'

params_doc = json.loads(PARAMS_PATH.read_text())
protocol = json.loads(PROTOCOL_PATH.read_text())

P = params_doc['parameters']
GAMMA = P['gamma']['value']
K = P['K']['value']
ALPHA = P['alpha']['value']
BETA = P['beta']['value']
SB = P['Sb']['value']
H = P['Gb']['value']
BODY_MASS_KG = P['bodyMassKg']['value']


def glucose_and_rate(scenario_id, t):
    """Returns (G, dG/dt) at time t (minutes), exactly matching the analytic
    formula declared for this scenario in validation/p4/beta-cell-protocol.json."""
    if scenario_id == 'basal-hold':
        return H, 0.0
    if scenario_id == 'step-plus80':
        ramp = 1.0 / 60.0  # 1 simulated second, in minutes
        if t <= 0:
            return H, 0.0
        if t >= ramp:
            return H + 80.0, 0.0
        return H + 80.0 * (t / ramp), 80.0 / ramp
    if scenario_id == 'ogtt-like':
        tp, a, gpeak = 37.5, 4.0, 160.0
        if t <= 0:
            return H, 0.0
        x = t / tp
        g = H + (gpeak - H) * (x ** a) * np.exp(a * (1 - x))
        # d/dt [ (t/tp)^a * exp(a*(1 - t/tp)) ] = (a/tp) * (t/tp)^(a-1) * exp(a*(1-t/tp)) * (1 - t/tp)
        dgdt = (gpeak - H) * (a / tp) * (x ** (a - 1)) * np.exp(a * (1 - x)) * (1 - x)
        return g, dgdt
    raise ValueError(f'Unknown scenario {scenario_id}')


def derivative(scenario_id):
    def f(t, y):
        Y, Ipo = y
        G, dGdt = glucose_and_rate(scenario_id, t)
        Spo = (Y + K * dGdt + SB) if dGdt > 0 else (Y + SB)
        dIpo = -GAMMA * Ipo + Spo
        if (G - H) >= -SB / BETA:
            dY = -ALPHA * (Y - BETA * (G - H))
        else:
            dY = -ALPHA * Y - ALPHA * SB
        return [dY, dIpo]
    return f


def initial_state():
    Y0 = 0.0  # steady state at G=Gb: beta*(Gb-h)=0
    Ipo0 = SB / GAMMA  # dIpo/dt=0 at Y=0, dG/dt=0: gamma*Ipo = Sb
    return [Y0, Ipo0]


def integrate(scenario, method):
    duration = scenario['durationMinutes']
    dt_seconds = scenario['sampleIntervalSeconds']
    times = np.arange(0, duration + 1e-9, dt_seconds / 60.0)
    sol = solve_ivp(derivative(scenario['id']), (0, duration), initial_state(),
                     method=method, t_eval=times, rtol=1e-11, atol=1e-14, max_step=0.5)
    if not sol.success:
        raise RuntimeError(f"{scenario['id']} ({method}): {sol.message}")
    return times, sol.y.T  # columns: Y, Ipo


def run():
    tol = protocol['toleranceTsVsReference']
    results = []
    max_cross_solver_error = 0.0
    for scenario in protocol['scenarios']:
        times, radau = integrate(scenario, 'Radau')
        _, bdf = integrate(scenario, 'BDF')
        cross_err = np.abs(radau - bdf) / (tol['absolutePmolKgMin'] + tol['relative'] * np.abs(radau))
        max_cross_solver_error = max(max_cross_solver_error, float(cross_err.max()))

        samples = []
        for i, t in enumerate(times):
            Y, Ipo = radau[i]
            G, dGdt = glucose_and_rate(scenario['id'], float(t))
            S_pmol_kg_min = GAMMA * Ipo
            samples.append({
                'timeMinutes': float(t),
                'glucoseMgDl': float(G),
                'dGdtMgDlPerMin': float(dGdt),
                'Y': float(Y),
                'Ipo': float(Ipo),
                'secretionPmolKgMin': float(S_pmol_kg_min),
                'secretionPmolMin': float(S_pmol_kg_min * BODY_MASS_KG),
            })
        results.append({
            'id': scenario['id'],
            'durationMinutes': scenario['durationMinutes'],
            'sampleIntervalSeconds': scenario['sampleIntervalSeconds'],
            'samples': samples,
        })

    assert max_cross_solver_error < 1.0, 'Independent Radau/BDF solver comparison exceeds predeclared tolerance'

    output = {
        'kind': 'computed-reference-not-experimental-data',
        'note': 'Independent SciPy transcription of the equations in models/dallaman2007/parameters.json and validation/p4/beta-cell-protocol.json. Does not read or execute the TypeScript implementation.',
        'parametersSHA256': hashlib.sha256(PARAMS_PATH.read_bytes()).hexdigest(),
        'protocolSHA256': hashlib.sha256(PROTOCOL_PATH.read_bytes()).hexdigest(),
        'referenceScriptSHA256': hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
        'invocation': 'work/p1/venv/bin/python scripts/reference-beta-cell.py',
        'platform': {'python': platform.python_version(), 'scipy': scipy.__version__, 'numpy': np.__version__},
        'solver': {'method': 'Radau', 'crossCheck': 'BDF', 'rtol': 1e-11, 'atol': 1e-14, 'maximumStepMinutes': 0.5},
        'maximumCrossSolverNormalizedError': max_cross_solver_error,
        'parametersUsed': {'gamma': GAMMA, 'K': K, 'alpha': ALPHA, 'beta': BETA, 'Sb': SB, 'h': H, 'bodyMassKg': BODY_MASS_KG},
        'scenarios': results,
    }
    OUTPUT_PATH.write_text(json.dumps(output, separators=(',', ':')) + '\n')
    print(json.dumps({
        'output': str(OUTPUT_PATH),
        'scenarios': [s['id'] for s in results],
        'maxCrossSolverNormalizedError': max_cross_solver_error,
        'basalSecretionPmolKgMin': results[0]['samples'][0]['secretionPmolKgMin'],
    }, indent=2))


if __name__ == '__main__':
    run()
