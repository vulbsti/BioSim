/**
 * Beta-cell insulin secretion subsystem: equation structure reproduced from the
 * Dalla Man/Breda family (Dalla Man, Rizza, Cobelli 2007, IEEE TBME 54(10):1740-1749;
 * Breda, Cavaghan, Toffolo, Polonsky, Cobelli 2001, Diabetes 50(1):150-158). Structure
 * verified against two sources actually read: PMC2769591 and PMC4179313 (see
 * models/dallaman2007/README.md). Every numeric constant below is a declared,
 * UNVERIFIED engineering placeholder pinned in models/dallaman2007/parameters.json;
 * the primary source's own Table 1 values could not be read (see that file's
 * `sources` section for the documented access attempts). Do not cite these numbers
 * as the literature's fitted values.
 *
 * Pure, dependency-free module: no imports, no shared mutable state, no I/O.
 */
import betaCellParametersJson from '../../models/dallaman2007/parameters.json';

export const BETA_CELL_VERSION = 'dallaman2007-betacell-structure-engineering-1';
export const BETA_CELL_SOLVER_VERSION = 'rk4-8substep-per-second-linear-glucose-interp-1';

export type BetaCellParameters = {
  /** 1/min. Relaxation rate of the Ipo pool: S = gamma * Ipo. */
  gamma: number;
  /** pmol/kg per mg/dL. Dynamic (first-phase) responsivity, multiplies dG/dt (mg/dL/min). */
  K: number;
  /** 1/min. Relaxation rate of the provision variable Y. */
  alpha: number;
  /** pmol/kg/min per mg/dL. Static (second-phase) responsivity, multiplies (G - h). */
  beta: number;
  /** pmol/kg/min. Basal secretion, also the value S settles to at G = h with dG/dt = 0. */
  Sb: number;
  /** mg/dL. Glucose threshold for the static component (paper sets h = Gb, basal glucose). */
  h: number;
  /** kg. Declared reference body mass for pmol/kg <-> pmol conversions. */
  bodyMassKg: number;
};

const p = betaCellParametersJson.parameters;
export const DEFAULT_BETA_CELL_PARAMS: BetaCellParameters = {
  gamma: p.gamma.value,
  K: p.K.value,
  alpha: p.alpha.value,
  beta: p.beta.value,
  Sb: p.Sb.value,
  h: p.Gb.value,
  bodyMassKg: p.bodyMassKg.value,
};

export type BetaCellState = {
  /** pmol/kg/min. Provision variable, above basal. */
  Y: number;
  /** pmol/kg. Releasable-insulin pool amount. */
  Ipo: number;
  /** mg/dL. Glucose at the end of the previous advanceBetaCell() call, used to derive dG/dt. */
  previousG: number;
};

export type BetaCellDerivative = {
  dY: number;
  dIpo: number;
};

export type BetaCellSample = {
  /** pmol/kg/min. */
  secretionPmolKgMin: number;
  /** pmol/min, using params.bodyMassKg. */
  secretionPmolMin: number;
};

function assertFinite(name: string, value: number): void {
  if (!Number.isFinite(value)) throw new Error(`Beta-cell input ${name} must be finite, got ${value}.`);
}

function validateParameters(params: BetaCellParameters): void {
  for (const [key, value] of Object.entries(params)) assertFinite(`params.${key}`, value as number);
  if (params.gamma <= 0) throw new Error('Beta-cell parameter gamma must be positive.');
  if (params.alpha <= 0) throw new Error('Beta-cell parameter alpha must be positive.');
  if (params.beta <= 0) throw new Error('Beta-cell parameter beta must be positive.');
  if (params.Sb < 0) throw new Error('Beta-cell parameter Sb must be non-negative.');
  if (params.bodyMassKg <= 0) throw new Error('Beta-cell parameter bodyMassKg must be positive.');
}

function validateState(state: BetaCellState): void {
  assertFinite('state.Y', state.Y);
  assertFinite('state.Ipo', state.Ipo);
  assertFinite('state.previousG', state.previousG);
  if (state.previousG < 0) throw new Error('Beta-cell state.previousG must be non-negative.');
}

function validateGlucose(name: string, G: number): void {
  assertFinite(name, G);
  if (G < 0) throw new Error(`Beta-cell glucose input ${name} must be non-negative, got ${G}.`);
}

/** Steady state at a held glucose level Gb: Y=beta*(Gb-h), Ipo solved from dIpo/dt=0 at that Y. */
export function betaCellInitial(Gb: number, params: BetaCellParameters = DEFAULT_BETA_CELL_PARAMS): BetaCellState {
  validateGlucose('Gb', Gb);
  validateParameters(params);
  const Y = params.beta * (Gb - params.h);
  const SpoSs = Y + params.Sb; // dG/dt = 0 at a held level, so the "otherwise" branch of Spo applies.
  const Ipo = SpoSs / params.gamma;
  return {Y, Ipo, previousG: Gb};
}

/**
 * Instantaneous derivative of the two dynamic states at a given (G, dG/dt) operating point.
 * Pure function: does not read or write `state`; returns a new object.
 */
export function betaCellDerivative(
  state: BetaCellState,
  G: number,
  dGdt: number,
  params: BetaCellParameters = DEFAULT_BETA_CELL_PARAMS,
): BetaCellDerivative {
  validateState(state);
  validateGlucose('G', G);
  assertFinite('dGdt', dGdt);
  validateParameters(params);
  const Spo = dGdt > 0 ? state.Y + params.K * dGdt + params.Sb : state.Y + params.Sb;
  const dIpo = -params.gamma * state.Ipo + Spo;
  const floor = G - params.h >= -params.Sb / params.beta;
  const dY = floor ? -params.alpha * (state.Y - params.beta * (G - params.h)) : -params.alpha * state.Y - params.alpha * params.Sb;
  return {dY, dIpo};
}

function secretionOf(state: BetaCellState, params: BetaCellParameters): BetaCellSample {
  const secretionPmolKgMin = params.gamma * state.Ipo;
  return {secretionPmolKgMin, secretionPmolMin: secretionPmolKgMin * params.bodyMassKg};
}

const SUBSTEPS_PER_SECOND = 8;

/**
 * Advances the beta-cell state by dtSeconds given a single new glucose sample G_mgdl
 * (the caller is expected to call this once per second of simulated time, per the
 * declared 1 Hz sampling in models/dallaman2007/README.md). Internally the model runs
 * in minutes; dtSeconds is converted explicitly. dG/dt is derived from
 * (G_mgdl - state.previousG) / dtMinutes and held constant across the call, while G
 * itself is linearly interpolated between state.previousG and G_mgdl for the static
 * term, using fixed RK4 substeps. Returns a new state and the resulting secretion
 * sample; does not mutate the input state.
 */
export function advanceBetaCell(
  state: BetaCellState,
  G_mgdl: number,
  dtSeconds: number,
  params: BetaCellParameters = DEFAULT_BETA_CELL_PARAMS,
): {state: BetaCellState; sample: BetaCellSample} {
  validateState(state);
  validateGlucose('G_mgdl', G_mgdl);
  assertFinite('dtSeconds', dtSeconds);
  if (dtSeconds <= 0) throw new Error(`Beta-cell dtSeconds must be positive, got ${dtSeconds}.`);
  validateParameters(params);

  const dtMinutes = dtSeconds / 60;
  const dGdt = (G_mgdl - state.previousG) / dtMinutes;
  const substeps = Math.max(1, Math.round(SUBSTEPS_PER_SECOND * dtSeconds));
  const stepMinutes = dtMinutes / substeps;

  let Y = state.Y, Ipo = state.Ipo;
  for (let i = 0; i < substeps; i++) {
    const tFrac0 = i / substeps, tFrac1 = (i + 0.5) / substeps, tFrac2 = (i + 1) / substeps;
    const G0 = state.previousG + (G_mgdl - state.previousG) * tFrac0;
    const G1 = state.previousG + (G_mgdl - state.previousG) * tFrac1;
    const G2 = state.previousG + (G_mgdl - state.previousG) * tFrac2;

    const a = betaCellDerivative({Y, Ipo, previousG: state.previousG}, G0, dGdt, params);
    const yb = Y + (stepMinutes * a.dY) / 2, ib = Ipo + (stepMinutes * a.dIpo) / 2;
    const b = betaCellDerivative({Y: yb, Ipo: ib, previousG: state.previousG}, G1, dGdt, params);
    const yc = Y + (stepMinutes * b.dY) / 2, ic = Ipo + (stepMinutes * b.dIpo) / 2;
    const c = betaCellDerivative({Y: yc, Ipo: ic, previousG: state.previousG}, G1, dGdt, params);
    const yd = Y + stepMinutes * c.dY, id = Ipo + stepMinutes * c.dIpo;
    const d = betaCellDerivative({Y: yd, Ipo: id, previousG: state.previousG}, G2, dGdt, params);

    Y = Y + (stepMinutes * (a.dY + 2 * b.dY + 2 * c.dY + d.dY)) / 6;
    Ipo = Ipo + (stepMinutes * (a.dIpo + 2 * b.dIpo + 2 * c.dIpo + d.dIpo)) / 6;
  }

  if (!Number.isFinite(Y) || !Number.isFinite(Ipo))
    throw new Error('Beta-cell integration left the finite numerical domain.');
  if (Ipo < 0) throw new Error('Beta-cell integration produced a negative Ipo pool; secretion cannot be negative.');

  const newState: BetaCellState = {Y, Ipo, previousG: G_mgdl};
  return {state: newState, sample: secretionOf(newState, params)};
}
