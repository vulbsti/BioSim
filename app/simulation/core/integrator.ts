import type {CompiledModel} from './model';
export const CORE_SOLVER_VERSION = 'conservative-rk4-step-doubling-1';
export const CORE_TICK_SECONDS = .25;
const RTOL = 1e-7, ATOL_MOL = 1e-21;
export type ChemicalState = {tick: number; amounts: number[]; extents: number[]};
export function initialChemicalState(model: CompiledModel): ChemicalState {
  return {tick: 0, amounts: [...model.initial], extents: model.stoichiometry.map(() => 0)};
}
function apply(model: CompiledModel, start: readonly number[], extents: readonly number[]): number[] {
  return start.map((n, i) => n + extents.reduce((sum, extent, r) => sum + model.stoichiometry[r][i] * extent, 0));
}
function rk4(model: CompiledModel, start: readonly number[], dt: number): {amounts: number[]; extents: number[]} | null {
  const rates = (n: number[]) => n.every(x => Number.isFinite(x) && x >= 0) ? model.rates(n) : null;
  const a = rates([...start]); if (!a) return null;
  const b = rates(apply(model, start, a.map(x => x * dt / 2))); if (!b) return null;
  const c = rates(apply(model, start, b.map(x => x * dt / 2))); if (!c) return null;
  const d = rates(apply(model, start, c.map(x => x * dt))); if (!d) return null;
  const extents = a.map((x, i) => dt * (x + 2 * b[i] + 2 * c[i] + d[i]) / 6);
  const amounts = apply(model, start, extents);
  return amounts.every(x => Number.isFinite(x) && x >= 0) && extents.every(x => Number.isFinite(x) && x >= 0) ? {amounts, extents} : null;
}
/** Fixed public ticks, adaptive conservative internal steps. No state clipping. */
export function advanceChemical(model: CompiledModel, previous: ChemicalState, seconds: number): ChemicalState {
  if (!Number.isFinite(seconds) || seconds < 0 || seconds > 7200 || !Number.isSafeInteger(seconds / CORE_TICK_SECONDS))
    throw new Error('Advance must be 0–7200 seconds in 0.25-second ticks.');
  validateChemicalState(model, previous);
  const s = structuredClone(previous), ticks = seconds / CORE_TICK_SECONDS;
  if (s.tick + ticks > 4 * 86400 * 7) throw new Error('Advance exceeds the chemical recording time domain.');
  for (let tick = 0; tick < ticks; tick++) {
    let remaining = CORE_TICK_SECONDS, dt = remaining, attempts = 0;
    while (remaining > 1e-14) {
      if (++attempts > 10000 || dt < 1e-10) throw new Error('Reaction step failed; rates exceed this solver domain. State was not committed.');
      dt = Math.min(dt, remaining);
      const full = rk4(model, s.amounts, dt), half = rk4(model, s.amounts, dt / 2);
      const fine = half && rk4(model, half.amounts, dt / 2);
      if (!full || !half || !fine) {dt /= 2; continue;}
      const error = Math.max(...fine.amounts.map((n, i) => Math.abs(n - full.amounts[i]) / (ATOL_MOL + RTOL * Math.max(n, s.amounts[i]))));
      if (!Number.isFinite(error) || error > 1) {dt /= 2; continue;}
      const extents = fine.extents.map((n, i) => n + half.extents[i]);
      s.amounts = apply(model, s.amounts, extents);
      if (s.amounts.some(n => !Number.isFinite(n) || n < 0)) throw new Error('Invalid conservative update; no state committed.');
      s.extents = s.extents.map((n, i) => n + extents[i]);
      remaining -= dt;
      if (error < .02) dt *= 2;
    }
    s.tick++;
  }
  return s;
}
export function validateChemicalState(model: CompiledModel, state: ChemicalState): void {
  if (!state || !Number.isSafeInteger(state.tick) || state.tick < 0 || state.tick > 4 * 86400 * 7 || !Array.isArray(state.amounts) || !Array.isArray(state.extents) || state.amounts.length !== model.initial.length || state.extents.length !== model.stoichiometry.length || [...state.amounts, ...state.extents].some(n => !Number.isFinite(n) || n < 0))
    throw new Error('Invalid chemical state.');
  const expected = apply(model, model.initial, state.extents);
  if (expected.some((n, i) => Math.abs(n - state.amounts[i]) > 1e-8 * Math.max(model.initial[i], state.amounts[i], 1e-15)))
    throw new Error('Chemical state disagrees with its reaction ledger.');
}
export function chemicalResidual(model: CompiledModel, state: ChemicalState): number {
  return Math.max(...apply(model, model.initial, state.extents).map((n, i) => Math.abs(n - state.amounts[i])));
}
export function exportChemical(model: CompiledModel, state: ChemicalState): string {
  validateChemicalState(model, state);
  return JSON.stringify({format: 'human-atlas/chemical-state', schema: 1, model: model.definition.id, version: model.definition.version, contract: model.signature, solver: CORE_SOLVER_VERSION, state});
}
export function importChemical(model: CompiledModel, text: string): ChemicalState {
  if (text.length > 1_000_000) throw new Error('Chemical recording is too large.');
  const data = JSON.parse(text);
  if (!data || data.format !== 'human-atlas/chemical-state' || data.schema !== 1 || data.model !== model.definition.id || data.version !== model.definition.version || data.contract !== model.signature || data.solver !== CORE_SOLVER_VERSION)
    throw new Error('Incompatible chemical model or solver; legacy body recordings use their own importer.');
  validateChemicalState(model, data.state);
  return structuredClone(data.state);
}
