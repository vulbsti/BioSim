import {
  BLOOD_EDGES,
  BLOOD_NODES,
  DEFAULT_CIRCULATION,
  STATE,
  TRANSPORT,
  circulationDerivative,
  circulationSample,
  initialCirculation,
  type CircuitCoupling,
  type CirculationConfig,
} from "../circulation/model";
import { insulinDerivative } from "../molecular/sedaghat";
import { advanceBetaCell, betaCellInitial, DEFAULT_BETA_CELL_PARAMS } from "./beta-cell";
import type { BodyState, MultiscaleMealState, Organ } from "./types";
import { concentration, syncNutrientTotals, transfer } from "./transport";

export const MULTISCALE_MEAL_VERSION = "meal-insulin-muscle-coupled-2";
export const MULTISCALE_MEAL_SOLVER = "p3-rk4-0.01s-body-coupled-2";
const CONFIG: CirculationConfig = { ...DEFAULT_CIRCULATION, dosePmol: 0, route: "portal" };

/** Body non-gas solutes distribute in 60% of blood volume (transport.ts), i.e. hematocrit 0.40. */
export const BODY_HEMATOCRIT = 0.4;
export const MUSCLE_CELL_ML = 18000;

/**
 * Which body transport compartments each P3 node stands for. The circuit's blood is the body's
 * blood: reference volumes, hematocrit, pump output, heart rate and branch flows come from here.
 */
export const NODE_BODY_MAP: Record<string, { compartments: string[]; share?: number }> = {
  arterial: { compartments: ["arterial"] },
  venous: { compartments: ["venous"] },
  "pulmonary-arterial": { compartments: ["lungs-blood"], share: 0.25 / 0.6 },
  "pulmonary-venous": { compartments: ["lungs-blood"], share: 0.35 / 0.6 },
  muscle: { compartments: ["muscle-blood"] },
  other: { compartments: ["heart-blood", "brain-blood", "skin-blood", "adipose-blood", "endocrine-blood"] },
  kidney: { compartments: ["kidneys-blood"] },
  gut: { compartments: ["gut-blood"] },
  portal: { compartments: ["portal"] },
  liver: { compartments: ["liver-blood"] },
};
const OTHER_BEDS: Organ[] = ["heart", "brain", "skin", "adipose", "endocrine"];

/** Radial shells of a Krogh-type cylinder with equal thickness: area ∝ 1, 3, 5, 7. */
export const PATCH_SHELLS = 4;
export const SHELL_WEIGHTS = [1, 3, 5, 7].map((n) => n / 16);
export const PATCH_CELL_IDS = SHELL_WEIGHTS.map((_, k) => `muscle-cell-r${k}`);
export const PATCH_FRACTIONS = [0.01, 0.05, 0.2] as const;
/** Synthetic interstitial insulin conductance between adjacent shells, relative to capillary PS. */
export const SHELL_CONDUCTANCE_RATIO = 6;

const bodyVolumeL = (s: BodyState, node: string) => {
  const map = NODE_BODY_MAP[node];
  return (
    map.compartments.reduce((a, id) => a + s.transport.compartments[id].volume, 0) *
    (map.share ?? 1)
  ) / 1000;
};
const flow = (s: BodyState, id: Organ) => (s.flows.find((f) => f.id === id)?.flow ?? 0) / 60;

/** Target mean whole-blood flows, L/s, in BLOOD_EDGES order. */
export function bodyEdgeFlows(s: BodyState): number[] {
  const co = s.cardiacOutput / 60,
    other = OTHER_BEDS.reduce((a, id) => a + flow(s, id), 0);
  const byEdge: Record<string, number> = {
    "left-pump": co,
    "right-pump": co,
    "pulmonary-arterial:pulmonary-venous": co,
    "arterial:muscle": flow(s, "muscle"),
    "muscle:venous": flow(s, "muscle"),
    "arterial:other": other,
    "other:venous": other,
    "arterial:kidney": flow(s, "kidneys"),
    "kidney:venous": flow(s, "kidneys"),
    "arterial:gut": flow(s, "gut"),
    "gut:portal": flow(s, "gut"),
    "portal:liver": flow(s, "gut"),
    "arterial:liver": flow(s, "liver"),
    "liver:venous": flow(s, "liver") + flow(s, "gut"),
  };
  return BLOOD_EDGES.map((e) => byEdge[e.id]);
}

export function circuitCoupling(s: BodyState): CircuitCoupling {
  const m = s.multiscaleMeal;
  return {
    hematocrit: BODY_HEMATOCRIT,
    interstitialL: s.transport.compartments["muscle-tissue"].volume / 1000,
    referenceVolumesL: m.referenceVolumesL,
    edgeFlowsLPerS: bodyEdgeFlows(s),
    cardiacOutputLPerS: s.cardiacOutput / 60,
    heartRate: s.heartRate,
    coarseFraction: 1 - m.patchFraction,
  };
}

export function createMultiscaleMeal(): MultiscaleMealState {
  return {
    enabled: false,
    version: MULTISCALE_MEAL_VERSION,
    solver: MULTISCALE_MEAL_SOLVER,
    sensitivity: 1,
    circulation: initialCirculation(),
    referenceVolumesL: BLOOD_NODES.map((n) => n.volumeL),
    meanFlowsLPerS: BLOOD_EDGES.map(() => 0),
    flowWindowL: BLOOD_EDGES.map(() => 0),
    flowWindowSeconds: 0,
    pumpPhase: 0,
    betaCell: { Y: 0, Ipo: 0, previousG: 0 },
    secretedPmol: 0,
    primedPmol: 0,
    muscleUptakeG: 0,
    lastSecretionPmolPerMin: 0,
    lastUptakeMgPerMin: 0,
    patchFraction: 0,
    patchInsulinMol: [],
    patchSignal: [],
    patchClearedMol: 0,
    patchUptakeG: 0,
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
    if (s.multiscaleMeal.patchFraction) setMusclePatch(s, 0);
    const cell = s.transport.compartments["muscle-cell"];
    transfer(s, cell.id, "muscle-tissue", "glucose", cell.amounts.glucose, "exchange");
    syncNutrientTotals(s);
  }
  s.multiscaleMeal = createMultiscaleMeal();
  if (enabled) {
    const m = s.multiscaleMeal;
    m.enabled = true;
    m.sensitivity = sensitivity;
    // The circuit adopts the body's current blood volumes as its pressure references.
    m.referenceVolumesL = BLOOD_NODES.map((n) => bodyVolumeL(s, n.id));
    m.circulation = [...m.referenceVolumesL, ...initialCirculation().slice(STATE.insulin)];
    m.meanFlowsLPerS = bodyEdgeFlows(s);
    m.betaCell = betaCellInitial(arterialMgDl(s));
    primeBasal(s);
  }
  s.receipts.push({id:s.nextId++,time:s.time,category:'input',title:enabled?'Physical meal pathway enabled':'Physical meal pathway disabled',detail:enabled?`Body-coupled insulin transport, Sedaghat signaling and GLUT4 cell uptake enabled at ${sensitivity}× sensitivity.`:'Residual intracellular glucose returned to muscle interstitium; legacy behavior restored.'});
}

/**
 * Start from the basal steady state instead of an insulin-free circulation. Insulin amounts solve
 * the linear mean-flow transport balance for the current basal secretion; signaling is integrated
 * at the resulting interstitial concentration. The primed inventory is its own ledger entry.
 */
function primeBasal(s: BodyState): void {
  const m = s.multiscaleMeal,
    y = m.circulation,
    k = circuitCoupling(s),
    n = BLOOD_NODES.length,
    size = n + 1,
    H = k.hematocrit;
  const A = Array.from({ length: size }, () => Array(size).fill(0) as number[]),
    b = Array(size).fill(0) as number[];
  const V = k.referenceVolumesL,
    at = (id: string) => BLOOD_NODES.findIndex((node) => node.id === id);
  BLOOD_EDGES.forEach((e, i) => {
    const from = at(e.from),
      to = at(e.to),
      rate = k.edgeFlowsLPerS[i] / V[from];
    A[from][from] -= rate;
    A[to][from] += rate;
  });
  const plasma = (id: string) => 1 / (V[at(id)] * (1 - H));
  const muscle = at("muscle"),
    ps = CONFIG.exchange * TRANSPORT.exchangeLPerS;
  A[muscle][muscle] -= ps * plasma("muscle");
  A[muscle][n] += ps / k.interstitialL;
  A[n][muscle] += ps * plasma("muscle");
  A[n][n] -= (ps + TRANSPORT.muscleClearanceLPerS) / k.interstitialL;
  A[at("liver")][at("liver")] -= CONFIG.hepaticClearance * TRANSPORT.hepaticClearanceLPerS * plasma("liver");
  A[at("kidney")][at("kidney")] -= TRANSPORT.renalClearanceLPerS * plasma("kidney");
  b[at("portal")] = -basalSecretionMolS(s);
  const x = solve(A, b);
  for (let i = 0; i < n; i++) y[STATE.insulin + i] = x[i];
  y[STATE.interstitial] = x[n];
  const primed = x.reduce((a, v) => a + v, 0);
  y[STATE.injected] = primed;
  m.primedPmol = primed * 1e12;
  // Signaling relaxes to the basal interstitial concentration (source time basis: minutes).
  let signal = y.slice(STATE.signal, STATE.integratedFlow);
  const input = (x[n] / k.interstitialL) * m.sensitivity,
    h = 0.0005;
  for (let t = 0; t < 240 / h; t++) {
    const d1 = insulinDerivative(signal, input),
      d2 = insulinDerivative(signal.map((v, i) => v + (h * d1[i]) / 2), input),
      d3 = insulinDerivative(signal.map((v, i) => v + (h * d2[i]) / 2), input),
      d4 = insulinDerivative(signal.map((v, i) => v + h * d3[i]), input);
    signal = signal.map((v, i) => v + (h * (d1[i] + 2 * d2[i] + 2 * d3[i] + d4[i])) / 6);
  }
  signal.forEach((v, i) => (y[STATE.signal + i] = v));
}

function solve(A: number[][], b: number[]): number[] {
  const n = b.length,
    M = A.map((row, i) => [...row, b[i]]);
  for (let c = 0; c < n; c++) {
    const p = M.reduce((best, row, r) => (r >= c && Math.abs(row[c]) > Math.abs(M[best][c]) ? r : best), c);
    [M[c], M[p]] = [M[p], M[c]];
    for (let r = c + 1; r < n; r++) {
      const f = M[r][c] / M[c][c];
      for (let j = c; j <= n; j++) M[r][j] -= f * M[c][j];
    }
  }
  const x = Array(n).fill(0) as number[];
  for (let r = n - 1; r >= 0; r--)
    x[r] = (M[r][n] - M[r].slice(r + 1, n).reduce((a, v, j) => a + v * x[r + 1 + j], 0)) / M[r][r];
  return x;
}

const arterialMgDl = (s: BodyState) => concentration(s.transport.compartments.arterial, "glucose") * 100000;
/** Steady-state secretion of the primed beta-cell pool, S = γ·Ipo, into the portal vein. */
function basalSecretionMolS(s: BodyState): number {
  const p = DEFAULT_BETA_CELL_PARAMS;
  return (p.gamma * s.multiscaleMeal.betaCell.Ipo * p.bodyMassKg * 1e-12) / 60;
}

/**
 * Refine (fraction > 0) or aggregate (fraction 0) a muscle patch. The patch owns `fraction` of the
 * muscle interstitial insulin, exchange, clearance, intracellular glucose, uptake capacity and
 * oxidation, split into four radial shells. Refinement initializes shells uniformly from the coarse
 * state (the coarse state does not determine a microstate); aggregation sums amounts and
 * population-weights signaling states, so both directions conserve every inventory.
 */
export function setMusclePatch(s: BodyState, fraction: number): void {
  const m = s.multiscaleMeal;
  if (!m.enabled) throw new Error("Enable the physical meal pathway before refining muscle.");
  if (fraction !== 0 && !(PATCH_FRACTIONS as readonly number[]).includes(fraction))
    throw new Error("Unsupported muscle patch fraction.");
  if (fraction === m.patchFraction) return;
  const c = s.transport.compartments,
    cell = c["muscle-cell"],
    y = m.circulation;
  if (m.patchFraction) {
    // Aggregate: amounts sum, signaling states are population-weighted.
    const phi = m.patchFraction;
    y[STATE.interstitial] += m.patchInsulinMol.reduce((a, b) => a + b, 0);
    y[STATE.muscleCleared] += m.patchClearedMol;
    const coarse = y.slice(STATE.signal, STATE.integratedFlow);
    for (let i = 0; i < coarse.length; i++)
      y[STATE.signal + i] =
        (1 - phi) * coarse[i] +
        phi * SHELL_WEIGHTS.reduce((a, w, k) => a + w * m.patchSignal[k][i], 0);
    for (const id of PATCH_CELL_IDS) transfer(s, id, cell.id, "glucose", c[id].amounts.glucose, "exchange");
    cell.volume = MUSCLE_CELL_ML;
    for (const id of PATCH_CELL_IDS) c[id].volume = MUSCLE_CELL_ML;
    m.muscleUptakeG += m.patchUptakeG;
    Object.assign(m, { patchFraction: 0, patchInsulinMol: [], patchSignal: [], patchClearedMol: 0, patchUptakeG: 0 });
    s.receipts.push({id:s.nextId++,time:s.time,category:'input',title:'Muscle patch aggregated',detail:`A ${phi * 100}% patch was summed back into the coarse muscle model; inventories were conserved.`});
  }
  if (fraction) {
    const signal = y.slice(STATE.signal, STATE.integratedFlow),
      insulin = y[STATE.interstitial];
    m.patchInsulinMol = SHELL_WEIGHTS.map((w) => insulin * fraction * w);
    y[STATE.interstitial] = insulin * (1 - fraction);
    m.patchSignal = SHELL_WEIGHTS.map(() => [...signal]);
    const glucose = cell.amounts.glucose;
    SHELL_WEIGHTS.forEach((w, k) => {
      c[PATCH_CELL_IDS[k]].volume = MUSCLE_CELL_ML * fraction * w;
      transfer(s, cell.id, PATCH_CELL_IDS[k], "glucose", glucose * fraction * w, "exchange");
    });
    cell.volume = MUSCLE_CELL_ML * (1 - fraction);
    m.patchFraction = fraction;
    s.receipts.push({id:s.nextId++,time:s.time,category:'input',title:'Muscle patch refined',detail:`${fraction * 100}% of the muscle population now runs as four radial shells with their own insulin diffusion, signaling and GLUT4 uptake.`});
  }
  syncNutrientTotals(s);
}

/** Linear patch insulin system plus shell signaling; `plasma` is muscle capillary plasma insulin, M. */
function patchDerivative(
  insulin: readonly number[],
  signal: readonly number[][],
  plasma: number,
  s: BodyState,
): { insulin: number[]; signal: number[][]; exchanged: number; cleared: number } {
  const m = s.multiscaleMeal,
    phi = m.patchFraction,
    volume = (s.transport.compartments["muscle-tissue"].volume / 1000) * phi,
    conc = insulin.map((n, k) => n / (volume * SHELL_WEIGHTS[k])),
    ps = phi * CONFIG.exchange * TRANSPORT.exchangeLPerS,
    g = ps * SHELL_CONDUCTANCE_RATIO;
  const d = insulin.map(() => 0);
  const exchanged = ps * (plasma - conc[0]);
  d[0] += exchanged;
  for (let k = 0; k + 1 < PATCH_SHELLS; k++) {
    const j = g * (conc[k] - conc[k + 1]);
    d[k] -= j;
    d[k + 1] += j;
  }
  let cleared = 0;
  conc.forEach((v, k) => {
    const r = phi * SHELL_WEIGHTS[k] * TRANSPORT.muscleClearanceLPerS * v;
    d[k] -= r;
    cleared += r;
  });
  return {
    insulin: d,
    signal: signal.map((y, k) => insulinDerivative(y, conc[k] * m.sensitivity).map((v) => v / 60)),
    exchanged,
    cleared,
  };
}

function advancePatch(s: BodyState, dt: number): void {
  const m = s.multiscaleMeal,
    y = m.circulation,
    muscle = BLOOD_NODES.findIndex((n) => n.id === "muscle"),
    plasma = y[STATE.insulin + muscle] / (y[muscle] * (1 - BODY_HEMATOCRIT));
  const add = (a: number[], b: number[], h: number) => a.map((v, i) => v + h * b[i]);
  const addSignal = (a: number[][], b: number[][], h: number) => a.map((row, k) => add(row, b[k], h));
  const k1 = patchDerivative(m.patchInsulinMol, m.patchSignal, plasma, s);
  const k2 = patchDerivative(add(m.patchInsulinMol, k1.insulin, dt / 2), addSignal(m.patchSignal, k1.signal, dt / 2), plasma, s);
  const k3 = patchDerivative(add(m.patchInsulinMol, k2.insulin, dt / 2), addSignal(m.patchSignal, k2.signal, dt / 2), plasma, s);
  const k4 = patchDerivative(add(m.patchInsulinMol, k3.insulin, dt), addSignal(m.patchSignal, k3.signal, dt), plasma, s);
  const w = (f: (k: typeof k1) => number) => (dt * (f(k1) + 2 * f(k2) + 2 * f(k3) + f(k4))) / 6;
  m.patchInsulinMol = m.patchInsulinMol.map((v, i) => v + w((k) => k.insulin[i]));
  m.patchSignal = m.patchSignal.map((row, r) => row.map((v, i) => v + w((k) => k.signal[r][i])));
  const exchanged = w((k) => k.exchanged);
  // The capillary loses exactly what the first shell gained; clearance is its own ledger.
  y[STATE.insulin + muscle] -= exchanged;
  m.patchClearedMol += w((k) => k.cleared);
}

/**
 * GLUT4 facilitated transport, symmetric in the two glucose concentrations. Capacity scales with
 * the source model's surface-GLUT4 percentage. UPTAKE is an order-of-magnitude engineering choice
 * (roughly tens of mg/min at basal and a few hundred at high surface GLUT4 for the whole muscle
 * population); it is not fitted to human data and GLUT1/basal non-GLUT4 transport is not modeled.
 */
export const UPTAKE = { vmaxGPerMinAtFullSurface: 1.12, kmGPerMl: 0.0009 };
function uptake(s: BodyState, cellId: string, glut4: number, share: number): number {
  const tissue = s.transport.compartments["muscle-tissue"],
    cell = s.transport.compartments[cellId],
    km = UPTAKE.kmGPerMl,
    ct = concentration(tissue, "glucose"),
    ci = concentration(cell, "glucose");
  const drive = ct / (km + ct) - ci / (km + ci);
  if (drive <= 0) return 0;
  const rate = (share * UPTAKE.vmaxGPerMinAtFullSurface * (glut4 / 100) * drive) / 60;
  return transfer(s, tissue.id, cell.id, "glucose", rate, "exchange");
}

/**
 * Experimental replacement boundary. The body-coupled P3 circuit owns physical insulin transport
 * and Sedaghat owns signaling. The body transport graph remains the only owner of glucose amounts.
 */
export function advanceMultiscaleMeal(s: BodyState): void {
  const m = s.multiscaleMeal;
  if (!m.enabled) return;
  // Dalla Man 2007 secretion structure (static + dG/dt dynamic components); constants are
  // declared engineering placeholders, not the paper's fitted values (models/dallaman2007).
  const beta = advanceBetaCell(m.betaCell, arterialMgDl(s), 1);
  m.betaCell = beta.state;
  const secretionPmolMin = beta.sample.secretionPmolMin;
  const secretionMolS = (secretionPmolMin * 1e-12) / 60,
    dt = 0.01,
    k = circuitCoupling(s);
  let y = m.circulation;
  const before = y.slice(STATE.integratedFlow),
    // Integrated pump phase: a heart-rate change alters the beat period, never the current phase.
    phaseTime = (m.pumpPhase * 60) / k.heartRate;
  for (let tick = 0; tick < 100; tick++) {
    const time = phaseTime + tick * dt,
      b = { portalInsulinMolPerS: secretionMolS, receptorSensitivity: m.sensitivity, coupling: k };
    const a = circulationDerivative(y, time, CONFIG, false, b);
    const q = y.map((v, i) => v + (dt * a[i]) / 2),
      bb = circulationDerivative(q, time + dt / 2, CONFIG, false, b);
    const r = y.map((v, i) => v + (dt * bb[i]) / 2),
      c = circulationDerivative(r, time + dt / 2, CONFIG, false, b);
    const u = y.map((v, i) => v + dt * c[i]),
      d = circulationDerivative(u, time + dt, CONFIG, false, b);
    y = y.map((v, i) => v + (dt * (a[i] + 2 * bb[i] + 2 * c[i] + d[i])) / 6);
    if (m.patchFraction) {
      m.circulation = y;
      advancePatch(s, dt);
    }
  }
  if (
    y.length !== m.circulation.length ||
    y.some((v) => !Number.isFinite(v)) ||
    y.slice(0, STATE.insulin).some((v) => v <= 0) ||
    y.slice(STATE.insulin, STATE.signal).some((v) => v < -1e-20) ||
    y.slice(STATE.signal, STATE.integratedFlow).some((v) => v < -1e-10) ||
    m.patchInsulinMol.some((v) => !Number.isFinite(v) || v < -1e-20) ||
    m.patchSignal.some((row) => row.some((v) => !Number.isFinite(v) || v < -1e-10))
  )
    throw new Error("The physical meal pathway left its supported numerical domain. No step was committed.");
  m.circulation = y;
  m.pumpPhase = (m.pumpPhase + k.heartRate / 60) % 1;
  // Exact 30-second block means of circuit branch flows for the coupling report.
  m.flowWindowL = m.flowWindowL.map((v, i) => v + y[STATE.integratedFlow + i] - before[i]);
  if (++m.flowWindowSeconds === 30) {
    m.meanFlowsLPerS = m.flowWindowL.map((v) => v / 30);
    m.flowWindowL = m.flowWindowL.map(() => 0);
    m.flowWindowSeconds = 0;
  }
  m.secretedPmol += secretionPmolMin / 60;
  m.lastSecretionPmolPerMin = secretionPmolMin;
  const phi = m.patchFraction;
  let moved = uptake(s, "muscle-cell", y[STATE.signal + 20], 1 - phi);
  m.muscleUptakeG += moved;
  if (phi)
    PATCH_CELL_IDS.forEach((id, i) => {
      const g = uptake(s, id, m.patchSignal[i][20], phi * SHELL_WEIGHTS[i]);
      m.patchUptakeG += g;
      moved += g;
    });
  m.lastUptakeMgPerMin = moved * 60000;
  syncNutrientTotals(s);
}

/** Intracellular glucose pools that experimental muscle oxidation draws from, with their shares. */
export function muscleGlucosePools(s: BodyState): { id: string; share: number }[] {
  const phi = s.multiscaleMeal.patchFraction;
  return [
    { id: "muscle-cell", share: 1 - phi },
    ...(phi ? PATCH_CELL_IDS.map((id, k) => ({ id, share: phi * SHELL_WEIGHTS[k] })) : []),
  ];
}

/** Total physical insulin inside the P4 ledgers, mol: circulating, interstitial (coarse + patch), cleared. */
export function insulinLedger(m: MultiscaleMealState) {
  const y = m.circulation,
    circulating = y.slice(STATE.insulin, STATE.interstitial).reduce((a, b) => a + b, 0),
    interstitial = y[STATE.interstitial] + m.patchInsulinMol.reduce((a, b) => a + b, 0),
    cleared = y.slice(STATE.hepaticCleared, STATE.injected).reduce((a, b) => a + b, 0) + m.patchClearedMol;
  return { injected: y[STATE.injected], circulating, interstitial, cleared, residual: y[STATE.injected] - circulating - interstitial - cleared };
}

/** How the insulin circuit maps onto the body glucose graph; every quantity is read, not assumed. */
export function circuitMappingReport(s: BodyState) {
  const m = s.multiscaleMeal,
    k = circuitCoupling(s),
    y = m.circulation;
  return {
    hematocrit: { circuit: k.hematocrit, body: 1 - 0.6 },
    muscleInterstitialL: { circuit: k.interstitialL, body: s.transport.compartments["muscle-tissue"].volume / 1000 },
    muscleCellL: {
      coarse: s.transport.compartments["muscle-cell"].volume / 1000,
      patch: PATCH_CELL_IDS.reduce((a, id) => a + (m.patchFraction ? s.transport.compartments[id].volume : 0), 0) / 1000,
    },
    heartRate: { circuit: k.heartRate, body: s.heartRate },
    nodes: BLOOD_NODES.map((n, i) => ({
      id: n.id,
      bodyCompartments: NODE_BODY_MAP[n.id].compartments,
      circuitVolumeL: y[i],
      referenceVolumeL: m.referenceVolumesL[i],
      bodyVolumeL: bodyVolumeL(s, n.id),
    })),
    branches: BLOOD_EDGES.map((e, i) => ({
      id: e.id,
      circuitMeanFlowLPerMin: m.meanFlowsLPerS[i] * 60,
      bodyFlowLPerMin: k.edgeFlowsLPerS[i] * 60,
    })),
    patchFraction: m.patchFraction,
  };
}

export function multiscaleMealReadout(s: BodyState) {
  const m = s.multiscaleMeal,
    sample = circulationSample(m.circulation, s.time, CONFIG, m.enabled ? circuitCoupling(s) : undefined);
  const patchVolume = (s.transport.compartments["muscle-tissue"].volume / 1000) * m.patchFraction;
  return {
    interstitialInsulinPM: sample.interstitialPM,
    aktPercent: sample.signal[16],
    surfaceGlut4Percent: sample.signal[20],
    patchShells: m.patchFraction
      ? SHELL_WEIGHTS.map((w, k) => ({
          weight: w,
          insulinPM: (m.patchInsulinMol[k] / (patchVolume * w)) * 1e12,
          aktPercent: m.patchSignal[k][16],
          surfaceGlut4Percent: m.patchSignal[k][20],
          cellGlucoseG: s.transport.compartments[PATCH_CELL_IDS[k]].amounts.glucose,
        }))
      : [],
    ...m,
  };
}
