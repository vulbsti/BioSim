import {
  DEFAULT_CIRCULATION,
  STATE,
  circulationDerivative,
  circulationSample,
  initialCirculation,
  type CirculationConfig,
} from "../circulation/model";
import type { BodyState, MultiscaleMealState } from "./types";
import { clamp } from "./endocrine";
import { concentration, syncNutrientTotals, transfer } from "./transport";

export const MULTISCALE_MEAL_VERSION = "meal-insulin-muscle-replacement-prototype-1";
export const MULTISCALE_MEAL_SOLVER = "p3-rk4-0.01s-body-coupled-1";
const CONFIG: CirculationConfig = { ...DEFAULT_CIRCULATION, dosePmol: 0, route: "portal" };

export function createMultiscaleMeal(): MultiscaleMealState {
  return {
    enabled: false,
    version: MULTISCALE_MEAL_VERSION,
    solver: MULTISCALE_MEAL_SOLVER,
    sensitivity: 1,
    circulation: initialCirculation(),
    secretedPmol: 0,
    muscleUptakeG: 0,
    lastSecretionPmolPerMin: 0,
    lastUptakeMgPerMin: 0,
  };
}

export function setMultiscaleMeal(s: BodyState, enabled: boolean, sensitivity: 1 | 0.35 | 0): void {
  if (![0, 0.35, 1].includes(sensitivity)) throw new Error("Unsupported physical insulin sensitivity.");
  if (enabled && s.multiscaleMeal.enabled) {
    if (s.multiscaleMeal.sensitivity !== sensitivity)
      s.receipts.push({id:s.nextId++,time:s.time,category:'input',title:'Physical insulin sensitivity changed',detail:`Sedaghat receptor input sensitivity: ${sensitivity}×. Physical insulin transport state was preserved.`});
    s.multiscaleMeal.sensitivity = sensitivity;
    return;
  }
  if (!enabled && s.multiscaleMeal.enabled) {
    const cell = s.transport.compartments["muscle-cell"];
    transfer(s, cell.id, "muscle-tissue", "glucose", cell.amounts.glucose, "exchange");
    syncNutrientTotals(s);
  }
  s.multiscaleMeal = enabled
    ? { ...createMultiscaleMeal(), enabled: true, sensitivity }
    : createMultiscaleMeal();
  s.receipts.push({id:s.nextId++,time:s.time,category:'input',title:enabled?'Physical meal pathway enabled':'Physical meal pathway disabled',detail:enabled?`P3 insulin transport, Sedaghat signaling and GLUT4 cell uptake enabled at ${sensitivity}× sensitivity.`:'Residual intracellular glucose returned to muscle interstitium; legacy behavior restored.'});
}

/**
 * Experimental replacement boundary. P3 owns physical insulin transport and Sedaghat owns
 * signaling. The body transport graph remains the only owner of glucose amounts.
 */
export function advanceMultiscaleMeal(s: BodyState): void {
  const m = s.multiscaleMeal;
  if (!m.enabled) return;
  const arterialMgDl = concentration(s.transport.compartments.arterial, "glucose") * 100000;
  // Engineering beta-cell boundary: basal plus physical arterial-glucose response. Not human fitted.
  const secretionPmolMin = clamp(35 + Math.max(0, arterialMgDl - 85) * 2.4, 20, 360);
  const secretionMolS = (secretionPmolMin * 1e-12) / 60,
    dt = 0.01;
  let y = m.circulation;
  for (let tick = 0; tick < 100; tick++) {
    const time = s.time + tick * dt,
      b = { portalInsulinMolPerS: secretionMolS, receptorSensitivity: m.sensitivity };
    const a = circulationDerivative(y, time, CONFIG, false, b);
    const q = y.map((v, i) => v + (dt * a[i]) / 2),
      bb = circulationDerivative(q, time + dt / 2, CONFIG, false, b);
    const r = y.map((v, i) => v + (dt * bb[i]) / 2),
      c = circulationDerivative(r, time + dt / 2, CONFIG, false, b);
    const u = y.map((v, i) => v + dt * c[i]),
      d = circulationDerivative(u, time + dt, CONFIG, false, b);
    y = y.map((v, i) => v + (dt * (a[i] + 2 * bb[i] + 2 * c[i] + d[i])) / 6);
  }
  if (
    y.length !== m.circulation.length ||
    y.some((v) => !Number.isFinite(v)) ||
    y.slice(0, STATE.insulin).some((v) => v <= 0) ||
    y.slice(STATE.insulin, STATE.signal).some((v) => v < -1e-20) ||
    y.slice(STATE.signal, STATE.integratedFlow).some((v) => v < -1e-10)
  )
    throw new Error("The physical meal pathway left its supported numerical domain. No step was committed.");
  m.circulation = y;
  m.secretedPmol += secretionPmolMin / 60;
  m.lastSecretionPmolPerMin = secretionPmolMin;
  const local = circulationSample(y, s.time + 1, CONFIG),
    glut4 = local.signal[20];
  const tissue = s.transport.compartments["muscle-tissue"],
    cell = s.transport.compartments["muscle-cell"];
  const gradient = Math.max(0, concentration(tissue, "glucose") - concentration(cell, "glucose"));
  // Population-weighted permeability. GLUT4 is the source-model surface pool percentage.
  const capacityGMin = clamp(0.02 + 0.3 * Math.max(0, glut4 - 4), 0.02, 0.3),
    requested = Math.min(capacityGMin / 60, gradient * tissue.volume * 0.12);
  const moved = transfer(s, tissue.id, cell.id, "glucose", requested, "exchange");
  m.muscleUptakeG += moved;
  m.lastUptakeMgPerMin = moved * 60000;
  syncNutrientTotals(s);
}

export function multiscaleMealReadout(s: BodyState) {
  const m = s.multiscaleMeal,
    sample = circulationSample(m.circulation, s.time, CONFIG);
  return {
    interstitialInsulinPM: sample.interstitialPM,
    aktPercent: sample.signal[16],
    surfaceGlut4Percent: sample.signal[20],
    ...m,
  };
}
