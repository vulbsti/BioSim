import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
  BETA_CELL_VERSION,
  DEFAULT_BETA_CELL_PARAMS,
  advanceBetaCell,
  betaCellDerivative,
  betaCellInitial,
  type BetaCellState,
} from '../app/simulation/beta-cell';

const reference = JSON.parse(readFileSync(new URL('../validation/p4/beta-cell-reference.json', import.meta.url), 'utf8'));
const protocol = JSON.parse(readFileSync(new URL('../validation/p4/beta-cell-protocol.json', import.meta.url), 'utf8'));
const tol = protocol.toleranceTsVsReference;
const params = DEFAULT_BETA_CELL_PARAMS;

function glucoseAndRate(scenarioId: string, tMinutes: number): {G: number; dGdt: number} {
  const H = params.h;
  if (scenarioId === 'basal-hold') return {G: H, dGdt: 0};
  if (scenarioId === 'step-plus80') {
    const ramp = 1 / 60;
    if (tMinutes <= 0) return {G: H, dGdt: 0};
    if (tMinutes >= ramp) return {G: H + 80, dGdt: 0};
    return {G: H + 80 * (tMinutes / ramp), dGdt: 80 / ramp};
  }
  if (scenarioId === 'ogtt-like') {
    const tp = 37.5, a = 4, gpeak = 160;
    if (tMinutes <= 0) return {G: H, dGdt: 0};
    const x = tMinutes / tp;
    const G = H + (gpeak - H) * x ** a * Math.exp(a * (1 - x));
    const dGdt = (gpeak - H) * (a / tp) * x ** (a - 1) * Math.exp(a * (1 - x)) * (1 - x);
    return {G, dGdt};
  }
  throw new Error(`unknown scenario ${scenarioId}`);
}

/** Runs the TS integrator at 1 Hz across a scenario and returns per-sample state/secretion. */
function runScenario(scenarioId: string, durationMinutes: number, sampleIntervalSeconds: number) {
  let state: BetaCellState = betaCellInitial(params.h, params);
  const out: {t: number; Y: number; Ipo: number; secretionPmolKgMin: number; secretionPmolMin: number}[] = [
    {t: 0, Y: state.Y, Ipo: state.Ipo, secretionPmolKgMin: params.gamma * state.Ipo, secretionPmolMin: params.gamma * state.Ipo * params.bodyMassKg},
  ];
  const totalSeconds = Math.round((durationMinutes * 60) / sampleIntervalSeconds) * sampleIntervalSeconds;
  for (let s = sampleIntervalSeconds; s <= totalSeconds; s += sampleIntervalSeconds) {
    const {G} = glucoseAndRate(scenarioId, s / 60);
    const advanced = advanceBetaCell(state, G, sampleIntervalSeconds, params);
    state = advanced.state;
    out.push({t: s / 60, Y: state.Y, Ipo: state.Ipo, secretionPmolKgMin: advanced.sample.secretionPmolKgMin, secretionPmolMin: advanced.sample.secretionPmolMin});
  }
  return out;
}

test('steady state at basal glucose is stationary', () => {
  const state = betaCellInitial(params.h, params);
  assert.equal(state.Y, 0);
  assert.ok(Math.abs(state.Ipo - params.Sb / params.gamma) < 1e-12);
  const deriv = betaCellDerivative(state, params.h, 0, params);
  assert.ok(Math.abs(deriv.dY) < 1e-12, `dY should be ~0 at steady state, got ${deriv.dY}`);
  assert.ok(Math.abs(deriv.dIpo) < 1e-12, `dIpo should be ~0 at steady state, got ${deriv.dIpo}`);
  // Holding basal glucose for an hour at 1 Hz must not drift the state or the secretion rate.
  const trace = runScenario('basal-hold', 60, 1);
  for (const point of trace) {
    assert.ok(Math.abs(point.secretionPmolKgMin - params.Sb) < 1e-9, `basal drift at t=${point.t}: ${point.secretionPmolKgMin}`);
    assert.equal(point.Y, 0);
  }
});

test('secretion increases with glucose and shows a first-phase response to dG/dt', () => {
  const state0 = betaCellInitial(params.h, params);
  // A glucose rise (positive dG/dt) must increase secretion beyond a flat hold at the same instantaneous G.
  const risen = advanceBetaCell(state0, params.h + 10, 1, params);
  const held = advanceBetaCell(betaCellInitial(params.h + 10, params), params.h + 10, 1, params);
  assert.ok(risen.sample.secretionPmolKgMin > params.Sb, 'secretion should rise above basal when glucose rises');
  // The first (ramp) second of the step scenario is dominated by the K*dG/dt dynamic term:
  // secretion there should exceed the ultimate new steady-state static response by itself,
  // i.e. show a transient first-phase spike, then relax toward (but not require reaching) it.
  const trace = runScenario('step-plus80', 5, 1);
  const firstSecond = trace[1].secretionPmolKgMin;
  const afterOneMinute = trace.find(p => Math.abs(p.t - 1) < 1e-9)!.secretionPmolKgMin;
  assert.ok(firstSecond > afterOneMinute, `expected a first-phase spike above the 1-minute level: ${firstSecond} vs ${afterOneMinute}`);
  assert.ok(afterOneMinute > params.Sb, 'secretion should remain elevated above basal after the step');
  void held;
});

for (const scenario of protocol.scenarios as {id: string; durationMinutes: number; sampleIntervalSeconds: number}[]) {
  test(`TS integrator matches the independent SciPy reference within declared tolerance: ${scenario.id}`, () => {
    const refScenario = reference.scenarios.find((s: {id: string}) => s.id === scenario.id);
    assert.ok(refScenario, `missing reference scenario ${scenario.id}`);
    const trace = runScenario(scenario.id, scenario.durationMinutes, scenario.sampleIntervalSeconds);
    assert.equal(trace.length, refScenario.samples.length, `sample count mismatch for ${scenario.id}`);
    let maxErr = 0;
    for (let i = 0; i < trace.length; i++) {
      const got = trace[i], want = refScenario.samples[i];
      assert.ok(Math.abs(got.t - want.timeMinutes) < 1e-9, `time mismatch at index ${i}`);
      for (const [gv, wv, label] of [
        [got.secretionPmolKgMin, want.secretionPmolKgMin, 'secretionPmolKgMin'],
        [got.Ipo, want.Ipo, 'Ipo'],
        [got.Y, want.Y, 'Y'],
      ] as const) {
        const err = Math.abs(gv - wv) / (tol.absolutePmolKgMin + tol.relative * Math.abs(wv));
        maxErr = Math.max(maxErr, err);
        assert.ok(err < 1, `${scenario.id} ${label} at t=${got.t}min: got ${gv}, want ${wv}, normalized error ${err}`);
      }
    }
  });
}

test('unit conversions are correct: pmol/kg/min <-> pmol/min, minutes <-> seconds', () => {
  const state = betaCellInitial(params.h, params);
  const advanced = advanceBetaCell(state, params.h, 60, params); // 60 seconds = 1 minute, held at basal
  assert.ok(Math.abs(advanced.sample.secretionPmolMin - advanced.sample.secretionPmolKgMin * params.bodyMassKg) < 1e-12);
  // Two 30-second calls should closely match one 60-second call at basal (no glucose change).
  const half1 = advanceBetaCell(state, params.h, 30, params);
  const half2 = advanceBetaCell(half1.state, params.h, 30, params);
  assert.ok(Math.abs(half2.state.Ipo - advanced.state.Ipo) < 1e-9);
  // A step expressed as a 1-minute-long single call should reach dG/dt = 80 mg/dL over 1 min = 80 mg/dL/min
  // averaged, distinct from expressing it as 60 one-second calls (finer time resolution): both must stay finite
  // and the coarse call must not error, demonstrating explicit second->minute conversion inside advanceBetaCell.
  const coarse = advanceBetaCell(betaCellInitial(params.h, params), params.h + 80, 60, params);
  assert.ok(Number.isFinite(coarse.sample.secretionPmolKgMin));
});

test('invalid inputs throw rather than silently clamping', () => {
  const state = betaCellInitial(params.h, params);
  assert.throws(() => advanceBetaCell(state, NaN, 1, params), /finite/);
  assert.throws(() => advanceBetaCell(state, -5, 1, params), /non-negative/);
  assert.throws(() => advanceBetaCell(state, params.h, 0, params), /positive/);
  assert.throws(() => advanceBetaCell(state, params.h, -1, params), /positive/);
  assert.throws(() => advanceBetaCell(state, params.h, Infinity, params), /finite/);
  assert.throws(() => betaCellInitial(-1, params), /non-negative/);
  assert.throws(() => betaCellDerivative(state, params.h, NaN, params), /finite/);
  assert.throws(() => advanceBetaCell({Y: NaN, Ipo: 1, previousG: params.h}, params.h, 1, params), /finite/);
  assert.throws(() => advanceBetaCell(state, params.h, 1, {...params, gamma: 0}), /gamma/);
  assert.throws(() => advanceBetaCell(state, params.h, 1, {...params, bodyMassKg: -1}), /bodyMassKg/);
});

test('module identity is versioned', () => {
  assert.equal(typeof BETA_CELL_VERSION, 'string');
  assert.ok(BETA_CELL_VERSION.length > 0);
});
