/**
 * No-feedback equations adapted from Sedaghat/Sherman/Quon (2002), JSim model 0166.
 * Archived implementation: Maris Lemba / University of Washington, copyright 1999–2010.
 * Copy permission and full acknowledgement are retained in models/sedaghat2002/source.
 * These mixed preparation, open-input kinetics are NOT the finite-pool chemical kernel.
 */
import k from '../../models/sedaghat2002/parameters.json';
export const SEDAGHAT_VERSION = 'sedaghat2002-jsim-no-feedback-1';
export const INSULIN_SOLVER_VERSION = 'rk4-0.0005min-event-split-1';
export const INSULIN_STATES = ['Rp', 'RIp', 'RI2p', 'RIPp', 'Rcyto', 'RI2Pcyto', 'RIPcyto', 'IRS1', 'IRS1P', 'IRS1sP', 'PI3k', 'IRSPI3k', 'PI345P3', 'PI45P2', 'PI34P2', 'Akt', 'AktP', 'PKCz', 'PKCzP', 'GLUT4cyto', 'GLUT4surf'] as const;
export const insulinInitial = () => [.9, 0, 0, 0, .1, 0, 0, 1, 0, 0, .1, 0, .31, 99.4, .29, 100, 0, 100, 0, 96, 4];
export type InsulinParameters = {doseNM: number; pulseMinutes: number};
export const DEFAULT_INSULIN: InsulinParameters = {doseNM: 100, pulseMinutes: 15};
export type InsulinSample = {time: number; insulinNM: number; state: number[]};
export function validateInsulinParameters(p: InsulinParameters): void {
  if (!p || !Number.isFinite(p.doseNM) || p.doseNM < 0 || p.doseNM > 100 || !Number.isInteger(p.pulseMinutes) || p.pulseMinutes < 1 || p.pulseMinutes > 30)
    throw new Error('Insulin input must be 0–100 nM with a 1–30 minute pulse.');
}
/** Time is minutes; first 12 states are pM, remaining states are source percentages. */
export function insulinDerivative(y: readonly number[], insulinM: number): number[] {
  const [rp, ri, ri2, rip, rc, ri2c, ripc, irs, irsp, , pi3, complex, pip3, pip2, pi34, akt, aktp, pkc, pkcp, glut, surface] = y;
  const synth = k.k_5 * (rc + ri2c + ripc > .1 ? 10 : 60) * 1e12;
  const receptorDrive = k.k7 * irs * (ri2 + rip) / (k.IRp * 1e12);
  const association = k.k8 * 1e-12 * irsp * pi3;
  const k9 = (k.k9stimulated - k.k9basal) * complex / (k.PI3K * 1e12) + k.k9basal;
  const k11 = .1 * k.k_11 * (pip3 - .31) / (3.1 - .31);
  const k12 = .1 * k.k_12 * (pip3 - .31) / (3.1 - .31);
  const effect = (.2 * aktp + .8 * pkcp) / k.APequil;
  const exportRate = k.k13 + (40 / 60 - 4 / 96) * k.k_13 * effect;
  return [
    k.k_1 * ri + k.k_3 * rip - k.k1 * insulinM * rp + k.k_4 * rc - k.k4 * rp,
    k.k1 * insulinM * rp - k.k_1 * ri - k.k3 * ri,
    k.k2 * insulinM * rip - k.k_2 * ri2 + k.k_44 * ri2c - k.k44 * ri2,
    k.k3 * ri + k.k_2 * ri2 - k.k2 * insulinM * rip - k.k_3 * rip + k.k_44 * ripc - k.k44 * rip,
    synth - k.k_5 * rc + k.k6 * (ri2c + ripc) + k.k4 * rp - k.k_4 * rc,
    k.k44 * ri2 - k.k_44 * ri2c - k.k6 * ri2c,
    k.k44 * rip - k.k_44 * ripc - k.k6 * ripc,
    k.k_7 * irsp - receptorDrive,
    receptorDrive + k.k_8 * complex - k.k_7 * irsp - association,
    0,
    k.k_8 * complex - association,
    association - k.k_8 * complex,
    k9 * pip2 + k.k10 * pi34 - (k.k_9 + k.k_10) * pip3,
    k.k_9 * pip3 - k9 * pip2,
    k.k_10 * pip3 - k.k10 * pi34,
    k.k_11 * aktp - k11 * akt,
    k11 * akt - k.k_11 * aktp,
    k.k_12 * pkcp - k12 * pkc,
    k12 * pkc - k.k_12 * pkcp,
    k.k_13 * surface - exportRate * glut + k.k14 - k.k_14 * glut,
    exportRate * glut - k.k_13 * surface,
  ];
}
export function runInsulin(p: InsulinParameters = DEFAULT_INSULIN, stepMinutes = .0005): InsulinSample[] {
  validateInsulinParameters(p);
  if (![.0005, .00025].includes(stepMinutes)) throw new Error('Unsupported reference-model integration step.');
  const ticksPerMinute = Math.round(1 / stepMinutes), sampleEvery = ticksPerMinute / 4;
  if (!Number.isInteger(sampleEvery)) throw new Error('Sample interval must align to integration ticks.');
  let y = insulinInitial();
  const samples: InsulinSample[] = [{time: 0, insulinNM: p.doseNM, state: [...y]}];
  for (let tick = 0; tick < 60 * ticksPerMinute; tick++) {
    // Every RK stage uses the input on this side of the discontinuity.
    const insulin = tick < p.pulseMinutes * ticksPerMinute ? p.doseNM * 1e-9 : 0;
    const a = insulinDerivative(y, insulin);
    const b = insulinDerivative(y.map((v, i) => v + stepMinutes * a[i] / 2), insulin);
    const c = insulinDerivative(y.map((v, i) => v + stepMinutes * b[i] / 2), insulin);
    const d = insulinDerivative(y.map((v, i) => v + stepMinutes * c[i]), insulin);
    y = y.map((v, i) => v + stepMinutes * (a[i] + 2 * b[i] + 2 * c[i] + d[i]) / 6);
    if ((tick + 1) % sampleEvery === 0) {
      if (y.some(v => !Number.isFinite(v) || v < -1e-10)) throw new Error('Insulin kinetics left the verified numerical domain.');
      samples.push({time: (tick + 1) * stepMinutes * 60, insulinNM: tick + 1 < p.pulseMinutes * ticksPerMinute ? p.doseNM : 0, state: [...y]});
    }
  }
  return samples;
}
