import {bindingFixture, compileBinding, DEFAULT_BINDING, type BindingParameters} from '../simulation/core/binding-fixture';
import {advanceChemical, chemicalResidual, CORE_SOLVER_VERSION, initialChemicalState} from '../simulation/core/integrator';
import {stableJSON} from '../simulation/core/model';
import {DEFAULT_INSULIN, INSULIN_SOLVER_VERSION, runInsulin, SEDAGHAT_VERSION, validateInsulinParameters, type InsulinParameters} from './sedaghat';
import source from '../../models/sedaghat2002/manifest.json';
import parameters from '../../models/sedaghat2002/parameters.json';

export type ExperimentConfig = {kind: 'binding'; parameters: BindingParameters} | {kind: 'insulin'; parameters: InsulinParameters};
export type MechanismSample = {time: number; values: Record<string, number>; state: number[]; ledger: number[]};
export type ExperimentResult = {
  kind: ExperimentConfig['kind']; duration: number; samples: MechanismSample[];
  maximumResidualMol: number | null; minimumState: number;
};
export const defaultConfig = (kind: ExperimentConfig['kind']): ExperimentConfig => kind === 'binding'
  ? {kind, parameters: {...DEFAULT_BINDING}} : {kind, parameters: {...DEFAULT_INSULIN}};
export function validateConfig(value: unknown): asserts value is ExperimentConfig {
  if (!value || typeof value !== 'object') throw new Error('Invalid experiment.');
  const c = value as ExperimentConfig;
  if (c.kind === 'binding') bindingFixture(c.parameters);
  else if (c.kind === 'insulin') validateInsulinParameters(c.parameters);
  else throw new Error('Unknown mechanism model.');
  const allowed = c.kind === 'binding' ? ['dosePmol', 'receptorPmol', 'clearancePerMinute'] : ['doseNM', 'pulseMinutes'];
  if (Object.keys(c).some(k => !['kind', 'parameters'].includes(k)) || Object.keys(c.parameters).some(k => !allowed.includes(k))) throw new Error('Unsupported experiment fields.');
}
export function runExperiment(config: ExperimentConfig): ExperimentResult {
  validateConfig(config);
  if (config.kind === 'binding') {
    const model = compileBinding(config.parameters);
    let s = initialChemicalState(model), residual = 0, minimum = Infinity;
    const samples: MechanismSample[] = [];
    for (let time = 0; time <= 1200; time += 5) {
      if (time) s = advanceChemical(model, s, 5);
      const [blood, tissue, receptor, complex, cleared] = s.amounts;
      const rates = model.rates(s.amounts);
      residual = Math.max(residual, chemicalResidual(model, s));
      minimum = Math.min(minimum, ...s.amounts);
      samples.push({time, state: [...s.amounts], ledger: [...s.extents], values: {
        blood: blood / model.volumes[0] * 1e12, tissue: tissue / model.volumes[1] * 1e12,
        bound: complex / model.volumes[3] * 1e12, occupancy: receptor + complex > 0 ? complex / (receptor + complex) * 100 : 0,
        cleared: cleared * 1e12, ligandTotal: (blood + tissue + complex + cleared) * 1e12,
        receptorTotal: (receptor + complex) * 1e12, bindingRate: rates[2] * 1e12,
        unbindingRate: rates[3] * 1e12, deliveryRate: rates[0] * 1e12, clearanceRate: rates[4] * 1e12,
      }});
    }
    return {kind: config.kind, duration: 1200, samples, maximumResidualMol: residual, minimumState: minimum};
  }
  const samples = runInsulin(config.parameters).map(s => ({time: s.time, state: s.state, ledger: [], values: {
    insulin: s.insulinNM, receptor: (s.state[2] + s.state[3]) / .897 * 100,
    pi3k: s.state[11] / .1 * 100, akt: s.state[16], glut4: s.state[20],
    occupancy: (s.state[1] + s.state[2] + s.state[3]) / (s.state[0] + s.state[1] + s.state[2] + s.state[3]) * 100,
  }}));
  return {kind: config.kind, duration: 3600, samples, maximumResidualMol: null, minimumState: Math.min(...samples.map(s => Math.min(...s.state)))};
}
/** Interpolate observations only. No physiological state is advanced by the renderer. */
export function observe(result: ExperimentResult, time: number): MechanismSample {
  const bounded = Math.max(0, Math.min(result.duration, time));
  const interval = result.samples[1].time, index = Math.min(result.samples.length - 1, Math.floor(bounded / interval));
  const a = result.samples[index], b = result.samples[Math.min(index + 1, result.samples.length - 1)];
  const t = b.time > a.time ? (bounded - a.time) / (b.time - a.time) : 0;
  return {time: bounded, values: Object.fromEntries(Object.keys(a.values).map(k => [k, k === 'insulin' ? a.values[k] : a.values[k] + t * (b.values[k] - a.values[k])])),
    state: a.state.map((v, i) => v + t * (b.state[i] - v)), ledger: a.ledger.map((v, i) => v + t * (b.ledger[i] - v))};
}
function contract(c: ExperimentConfig): string {
  return c.kind === 'binding' ? stableJSON({model: bindingFixture(c.parameters), solver: CORE_SOLVER_VERSION})
    : stableJSON({model: SEDAGHAT_VERSION, solver: INSULIN_SOLVER_VERSION, source: source.files, parameters});
}
export function exportExperiment(config: ExperimentConfig, time: number): string {
  validateConfig(config);
  const max = config.kind === 'binding' ? 1200 : 3600;
  if (!Number.isFinite(time) || time < 0 || time > max) throw new Error('Invalid experiment playhead.');
  return JSON.stringify({format: 'human-atlas/mechanism-experiment', schema: 1, config, contract: contract(config), time,
    scope: 'Isolated mechanism. Recomputes the deterministic trajectory on import; does not replace or modify a whole-body recording.'}, null, 2);
}
export function importExperiment(text: string): {config: ExperimentConfig; time: number} {
  if (text.length > 100_000) throw new Error('Mechanism recording exceeds 100 kB.');
  const d = JSON.parse(text);
  if (!d || d.format !== 'human-atlas/mechanism-experiment' || d.schema !== 1) throw new Error('This is not a compatible molecular-lab experiment. Whole-body recordings load in the physiology lab.');
  validateConfig(d.config);
  if (d.contract !== contract(d.config)) throw new Error('Model parameters or solver version differ from this recording.');
  const duration = d.config.kind === 'binding' ? 1200 : 3600;
  if (!Number.isFinite(d.time) || d.time < 0 || d.time > duration) throw new Error('Invalid recorded playhead.');
  return {config: structuredClone(d.config), time: d.time};
}
