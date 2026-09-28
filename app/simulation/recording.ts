import {
  createBody,
  MODEL_VERSION,
  validateAction,
  carbohydrateResidual,
  fatResidual,
  proteinResidual,
  waterResidual,
  INPUT_BOUNDS,
} from "./engine";
import {
  createMultiscaleMeal,
  insulinLedger,
  MULTISCALE_MEAL_SOLVER,
  MULTISCALE_MEAL_VERSION,
  PATCH_CELL_IDS,
  PATCH_FRACTIONS,
  PATCH_SHELLS,
} from "./multiscale-meal";
import { HORMONES, SUBSTANCES, type BodyState, type Sample } from "./types";
import { gasResiduals, totalSubstance } from "./transport";
import { STATE, initialCirculation } from "../circulation/model";

export type Recording = {
  model: string;
  exportedAt: string;
  state: BodyState;
  reference: BodyState | null;
  scope: string;
};
const object = (x: unknown): x is Record<string, unknown> =>
  !!x && typeof x === "object" && !Array.isArray(x);
function finiteTree(x: unknown, path: string) {
  if (typeof x === "number" && !Number.isFinite(x)) throw new Error(`${path} must be finite.`);
  if (object(x) || Array.isArray(x))
    for (const [key, value] of Object.entries(x)) finiteTree(value, `${path}.${key}`);
}
function shape(value: unknown, template: unknown, path: string) {
  if (template === null) {
    if (value !== null) throw new Error(`Invalid ${path}.`);
    return;
  }
  if (typeof value !== typeof template || (value === null && template !== null))
    throw new Error(`Invalid ${path}.`);
  if (object(template)) {
    if (!object(value)) throw new Error(`Invalid ${path}.`);
    for (const key of Object.keys(template)) shape(value[key], template[key], `${path}.${key}`);
    for (const key of Object.keys(value))
      if (!Object.hasOwn(template, key)) throw new Error(`Unknown field ${path}.${key}.`);
  }
}
const close = (a: number, b: number, tolerance: number) => Math.abs(a - b) <= tolerance;
function validateMultiscaleMeal(s: BodyState) {
  const m = s.multiscaleMeal;
  if (m.version !== MULTISCALE_MEAL_VERSION || m.solver !== MULTISCALE_MEAL_SOLVER)
    throw new Error("Incompatible multiscale meal model or solver.");
  if (![0, 0.35, 1].includes(m.sensitivity))
    throw new Error("Invalid multiscale meal sensitivity.");
  const expected = initialCirculation();
  if (
    !Array.isArray(m.circulation) ||
    m.circulation.length !== expected.length ||
    !m.circulation.every((value) => typeof value === "number" && Number.isFinite(value))
  )
    throw new Error("Invalid multiscale meal circulation state.");
  const y = m.circulation;
  const numbers = (a: unknown, n: number) =>
    Array.isArray(a) && a.length === n && a.every((v) => typeof v === "number" && Number.isFinite(v));
  if (!numbers(m.referenceVolumesL, 10) || m.referenceVolumesL.some((v) => v <= 0) || !numbers(m.meanFlowsLPerS, expected.length - STATE.integratedFlow) ||
    !numbers(m.flowWindowL, expected.length - STATE.integratedFlow) ||
    !Number.isInteger(m.flowWindowSeconds) || m.flowWindowSeconds < 0 || m.flowWindowSeconds >= 30 ||
    !(m.pumpPhase >= 0 && m.pumpPhase < 1) ||
    !object(m.betaCell) || !numbers([m.betaCell.Y, m.betaCell.Ipo, m.betaCell.previousG], 3) ||
    m.betaCell.Ipo < 0 || m.betaCell.previousG < 0)
    throw new Error("Invalid multiscale circulation coupling state.");
  const volumes = y.slice(STATE.volume, STATE.insulin);
  const reference = m.referenceVolumesL.reduce((a, b) => a + b, 0);
  if (volumes.some((value) => value <= 0) || !close(volumes.reduce((a, b) => a + b, 0), reference, 1e-8))
    throw new Error("Multiscale circulation volume is outside its conserved domain.");
  if (y.slice(STATE.insulin, STATE.signal).some((value) => value < -1e-20))
    throw new Error("Multiscale insulin state must be nonnegative.");
  const phi = m.patchFraction;
  if (phi !== 0 && !(PATCH_FRACTIONS as readonly number[]).includes(phi)) throw new Error("Invalid muscle patch fraction.");
  if (
    !numbers(m.patchInsulinMol, phi ? PATCH_SHELLS : 0) ||
    m.patchInsulinMol.some((v) => v < -1e-20) ||
    !Array.isArray(m.patchSignal) ||
    m.patchSignal.length !== (phi ? PATCH_SHELLS : 0) ||
    !m.patchSignal.every((row) => numbers(row, STATE.integratedFlow - STATE.signal)) ||
    m.patchClearedMol < 0 ||
    m.patchUptakeG < 0 ||
    (!phi && (m.patchClearedMol !== 0 || m.patchUptakeG !== 0))
  )
    throw new Error("Invalid refined muscle patch state.");
  for (const id of PATCH_CELL_IDS)
    if (!phi && Object.values(s.transport.compartments[id].amounts).some((v) => v !== 0))
      throw new Error("Coarse muscle state contains refined patch balances.");
  if (Math.abs(insulinLedger(m).residual) > 1e-18)
    throw new Error("Multiscale insulin ledger is not conserved.");
  const pools: Array<[number, number, number]> = [
    [10, 12, 0.1],
    [12, 15, 100],
    [15, 17, 100],
    [17, 19, 100],
  ];
  for (const signal of [y.slice(STATE.signal, STATE.integratedFlow), ...m.patchSignal]) {
    if (signal.some((value) => value < -1e-10))
      throw new Error("Sedaghat signal state is outside its source domain.");
    if (pools.some(([from, to, total]) => !close(signal.slice(from, to).reduce((a, b) => a + b, 0), total, 1e-5)))
      throw new Error("Sedaghat conserved pool is invalid.");
  }
  for (const key of [
    "secretedPmol",
    "muscleUptakeG",
    "lastSecretionPmolPerMin",
    "lastUptakeMgPerMin",
  ] as const)
    if (m[key] < 0) throw new Error(`Negative multiscale meal ledger ${key}.`);
  if (m.primedPmol < 0 || (!m.enabled && m.primedPmol !== 0)) throw new Error("Invalid primed insulin ledger.");
  if (!close((m.secretedPmol + m.primedPmol) * 1e-12, y[STATE.injected], 1e-18))
    throw new Error("Secreted insulin disagrees with the physical insulin ledger.");
  const cell = s.transport.compartments["muscle-cell"];
  if (!m.enabled) {
    if (
      m.sensitivity !== 1 ||
      m.secretedPmol !== 0 ||
      m.muscleUptakeG !== 0 ||
      m.lastSecretionPmolPerMin !== 0 ||
      m.lastUptakeMgPerMin !== 0 ||
      y.some((value, index) => value !== expected[index]) ||
      m.referenceVolumesL.some((value, index) => value !== expected[index]) ||
      m.meanFlowsLPerS.some((value) => value !== 0) ||
      m.flowWindowL.some((value) => value !== 0) ||
      m.flowWindowSeconds !== 0 ||
      m.pumpPhase !== 0 ||
      Object.values(m.betaCell).some((value) => value !== 0) ||
      Object.values(cell.amounts).some((value) => value !== 0)
    )
      throw new Error("Disabled multiscale meal state contains active pathway balances.");
  }
}
function validateState(value: unknown): asserts value is BodyState {
  if (!object(value)) throw new Error("Missing simulation state.");
  const template = createBody();
  for (const [key, v] of Object.entries(template))
    if (!Array.isArray(v)) shape(value[key], v, `state.${key}`);
  const s = value as unknown as BodyState;
  finiteTree(s, "state");
  if (s.version !== 2 || !Number.isInteger(s.time) || s.time < 0 || s.time > 7 * 86400)
    throw new Error("Unsupported simulation time or version.");
  for (const [key, [min, max]] of Object.entries(INPUT_BOUNDS)) {
    const v = s.inputs[key as keyof typeof s.inputs];
    if (v < min || v > max) throw new Error(`Invalid input ${key}.`);
  }
  for (const key of HORMONES)
    if (s.hormones[key] < 0 || s.hormones[key] > 15) throw new Error(`Invalid ${key} activity.`);
  for (const key of ["queue", "receipts", "history", "flows"] as const)
    if (!Array.isArray(s[key]) || s[key].length > 50000)
      throw new Error(`Invalid ${key} collection.`);
  const sampleShape: Sample = template.history[0];
  let last = -1;
  for (const point of s.history) {
    shape(point, sampleShape, "history sample");
    if (point.time < last || point.time > s.time)
      throw new Error("History timestamps are out of order.");
    last = point.time;
  }
  for (const f of s.flows) {
    shape(f, template.flows[0], "flow");
    if (!template.flows.some((t) => t.id === f.id) || f.flow < 0)
      throw new Error("Invalid organ flow.");
  }
  if (
    s.flows.length !== template.flows.length ||
    new Set(s.flows.map((f) => f.id)).size !== s.flows.length
  )
    throw new Error("Incomplete organ flow collection.");
  const ids = new Set<number>();
  for (const e of [...s.queue, ...s.receipts]) {
    if (!object(e) || !Number.isInteger(e.id) || e.id < 1 || ids.has(e.id))
      throw new Error("Invalid or duplicate event identifier.");
    ids.add(e.id);
  }
  last = s.time;
  for (const e of s.queue) {
    if (!Number.isInteger(e.at) || e.at < last || e.at > 7 * 86400 || typeof e.label !== "string")
      throw new Error("Invalid queued event.");
    validateAction(e.action);
    last = e.at;
  }
  last = -1;
  for (const e of s.receipts) {
    if (
      !Number.isInteger(e.time) ||
      e.time < last ||
      e.time > s.time ||
      typeof e.title !== "string" ||
      typeof e.detail !== "string" ||
      !["input", "response"].includes(e.category)
    )
      throw new Error("Invalid event receipt.");
    last = e.time;
  }
  if (!Number.isInteger(s.nextId) || s.nextId <= Math.max(0, ...ids))
    throw new Error("Invalid next event identifier.");
  for (const fn of [waterResidual, carbohydrateResidual, proteinResidual, fatResidual])
    if (Math.abs(fn(s)) > 1e-5) throw new Error("Recording fails substrate conservation checks.");
  for (const key of [
    "glucoseMass",
    "aminoAcids",
    "lipids",
    "glycogen",
    "fatStore",
    "proteinStore",
    "plasma",
    "interstitial",
    "intracellular",
    "sodium",
  ] as const)
    if (s[key] < 0) throw new Error(`Negative ${key} pool.`);
  if (s.plasma + s.interstitial < 1) throw new Error("Invalid fluid distribution volume.");
  for (const c of Object.values(s.transport.compartments)) {
    if (c.volume <= 0) throw new Error("Invalid compartment volume.");
    for (const amount of Object.values(c.amounts))
      if (amount < -1e-10) throw new Error("Negative transported substance.");
  }
  validateMultiscaleMeal(s);
  for (const [species, amount] of [
    ["glucose", s.glucoseMass],
    ["aminoAcids", s.aminoAcids],
    ["lipids", s.lipids],
  ] as const)
    if (Math.abs(totalSubstance(s, species) - amount) > 1e-7)
      throw new Error("Compartment totals disagree with systemic state.");
  for (const list of [s.transport.fluxes, s.transport.cumulativeFluxes]) {
    if (!Array.isArray(list) || list.length > 10000) throw new Error("Invalid flux ledger.");
    for (const f of list)
      if (
        !object(f) ||
        typeof f.id !== "string" ||
        typeof f.from !== "string" ||
        typeof f.to !== "string" ||
        !SUBSTANCES.includes(f.substance) ||
        !Number.isFinite(f.amount) ||
        f.amount < 0 ||
        !["advection", "exchange", "reaction", "absorption", "clearance"].includes(f.mechanism)
      )
        throw new Error("Invalid flux receipt.");
  }
  const gases = gasResiduals(s);
  if (Math.abs(gases.oxygen) > 1e-5 || Math.abs(gases.carbonDioxide) > 1e-5)
    throw new Error("Recording fails gas conservation.");
}
export function parseRecording(text: string): Recording {
  if (text.length > 15_000_000) throw new Error("Recording exceeds the 15 MB import limit.");
  const data: unknown = JSON.parse(text);
  const P4 = "atlas-physiology-0.3.0-p4-experimental";
  if (!object(data) || ![MODEL_VERSION, P4, "atlas-physiology-0.2.0"].includes(data.model as string))
    throw new Error(`Expected a ${MODEL_VERSION} recording.`);
  if (data.model === P4) {
    // The 0.3 synthetic circuit cannot be re-expressed in body-coupled units; only coarse runs migrate.
    const template = createBody();
    for (const key of ["state", "reference"] as const) {
      const state = data[key];
      if (!object(state)) continue;
      const meal = state.multiscaleMeal,
        compartments = object(state.transport) ? state.transport.compartments : undefined;
      if (!object(meal) || meal.enabled !== false)
        throw new Error("Recordings with an active 0.3 physical meal pathway cannot be resumed by the body-coupled model.");
      state.multiscaleMeal = createMultiscaleMeal();
      if (object(compartments))
        for (const id of PATCH_CELL_IDS) {
          if (Object.hasOwn(compartments, id)) throw new Error("Legacy recording contains fields from a newer model.");
          compartments[id] = structuredClone(template.transport.compartments[id]);
        }
    }
    data.model = MODEL_VERSION;
  }
  if (data.model === "atlas-physiology-0.2.0") {
    const template = createBody();
    for (const key of ["state", "reference"] as const) {
      const state = data[key];
      if (!object(state)) continue;
      const transport = state.transport;
      const compartments = object(transport) ? transport.compartments : undefined;
      if (
        Object.hasOwn(state, "multiscaleMeal") ||
        (object(compartments) && Object.hasOwn(compartments, "muscle-cell"))
      )
        throw new Error("Legacy recording contains fields from a newer model.");
      state.multiscaleMeal = createMultiscaleMeal();
      if (object(compartments))
        for (const id of ["muscle-cell", ...PATCH_CELL_IDS])
          compartments[id] = structuredClone(template.transport.compartments[id]);
    }
    data.model = MODEL_VERSION;
  }
  validateState(data.state);
  if (data.reference !== null) {
    validateState(data.reference);
    if (data.reference.time !== data.state.time)
      throw new Error("Comparison time does not match the run.");
  }
  return data as unknown as Recording;
}
