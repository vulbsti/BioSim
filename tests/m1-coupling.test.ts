import { test } from "node:test";
import assert from "node:assert/strict";
import { advance, applyAction, carbohydrateResidual, createBody, glucose, MODEL_VERSION } from "../app/simulation/engine";
import {
  BODY_HEMATOCRIT,
  circuitMappingReport,
  insulinLedger,
  multiscaleMealReadout,
  PATCH_CELL_IDS,
  setMultiscaleMeal,
  setMusclePatch,
} from "../app/simulation/multiscale-meal";
import { parseRecording } from "../app/simulation/recording";
import { STATE } from "../app/circulation/model";
import type { BodyState } from "../app/simulation/types";

const meal = { kind: "meal", meal: { carbs: 75, protein: 0, fat: 0, water: 0, sodium: 0 } } as const;
const body = (fraction = 0) => {
  const s = createBody();
  setMultiscaleMeal(s, true, 1);
  if (fraction) setMusclePatch(s, fraction);
  return s;
};
const relative = (a: number, b: number) => Math.abs(a - b) / Math.max(Math.abs(b), 1e-12);
function numericDiffs(a: unknown, b: unknown, path = "", out: string[] = []): string[] {
  if (typeof a === "number" && typeof b === "number") {
    if (Math.abs(a - b) > 1e-15 * Math.max(1, Math.abs(a))) out.push(`${path}: ${a} vs ${b}`);
  } else if (a && typeof a === "object" && b && typeof b === "object")
    for (const key of Object.keys(a)) numericDiffs((a as never)[key], (b as never)[key], `${path}.${key}`, out);
  return out;
}

test("B1: the insulin circuit uses the body's hematocrit, muscle population and branch flows", () => {
  const s = body();
  applyAction(s, meal);
  advance(s, 180);
  const r = circuitMappingReport(s);
  assert.equal(r.hematocrit.circuit, r.hematocrit.body);
  assert.equal(r.hematocrit.circuit, BODY_HEMATOCRIT);
  assert.equal(r.muscleInterstitialL.circuit, r.muscleInterstitialL.body);
  assert.equal(r.heartRate.circuit, r.heartRate.body);
  const circuitTotal = r.nodes.reduce((a, n) => a + n.circuitVolumeL, 0),
    referenceTotal = r.nodes.reduce((a, n) => a + n.referenceVolumeL, 0);
  assert.ok(Math.abs(circuitTotal - referenceTotal) < 1e-9, "circuit blood volume is conserved");
  for (const n of r.nodes) assert.ok(relative(n.circuitVolumeL, n.bodyVolumeL) < 0.15, `${n.id} volume`);
  for (const b of r.branches)
    assert.ok(
      relative(b.circuitMeanFlowLPerMin, b.bodyFlowLPerMin) < (b.id.endsWith("pump") ? 0.05 : 0.02),
      `${b.id}: circuit ${b.circuitMeanFlowLPerMin} vs body ${b.bodyFlowLPerMin} L/min`,
    );
});

test("B1: circuit branch flows follow a change in body muscle perfusion", () => {
  const s = body();
  advance(s, 60);
  const rest = circuitMappingReport(s).branches.find((b) => b.id === "arterial:muscle")!;
  applyAction(s, { kind: "environment", values: { exercise: 0.5 } });
  // Compare after the body settles; 30 s block means necessarily trail a ramp.
  advance(s, 300);
  const report = circuitMappingReport(s),
    active = report.branches.find((b) => b.id === "arterial:muscle")!;
  assert.ok(active.bodyFlowLPerMin > rest.bodyFlowLPerMin * 3, "exercise raises body muscle flow");
  for (const b of report.branches) assert.ok(relative(b.circuitMeanFlowLPerMin, b.bodyFlowLPerMin) < 0.03, b.id);
});

test("B1: enabling starts at a primed basal steady state recorded in its own ledger", () => {
  const s = body(),
    m = s.multiscaleMeal,
    y = m.circulation;
  assert.ok(m.primedPmol > 0);
  assert.ok(Math.abs(m.primedPmol * 1e-12 - y[STATE.injected]) < 1e-21);
  const before = multiscaleMealReadout(s).interstitialInsulinPM;
  advance(s, 300);
  const after = multiscaleMealReadout(s).interstitialInsulinPM;
  assert.ok(before > 10, "interstitial insulin is not started from zero");
  assert.ok(relative(after, before) < 0.1, `basal drift ${before} → ${after} pM without a meal`);
});

test("E03: refine then aggregate is an exact round trip", () => {
  const s = body();
  applyAction(s, meal);
  advance(s, 300);
  const before = structuredClone(s);
  setMusclePatch(s, 0.05);
  setMusclePatch(s, 0);
  const diffs = numericDiffs(before, s).filter((d) => !/receipts|nextId|[fF]luxes/.test(d));
  assert.deepEqual(diffs, []);
  for (const id of PATCH_CELL_IDS) assert.equal(s.transport.compartments[id].amounts.glucose, 0);
});

test("E03: a refined patch conserves every inventory and never double-counts uptake", () => {
  const s = body(0.2);
  applyAction(s, meal);
  advance(s, 900);
  const m = s.multiscaleMeal;
  assert.ok(Math.abs(carbohydrateResidual(s)) < 1e-8);
  assert.ok(Math.abs(insulinLedger(m).residual) < 1e-18);
  const moved = s.transport.cumulativeFluxes
    .filter((f) => f.from === "muscle-tissue" && ["muscle-cell", ...PATCH_CELL_IDS].includes(f.to) && f.substance === "glucose")
    .reduce((a, f) => a + f.amount, 0);
  assert.ok(Math.abs(moved - (m.muscleUptakeG + m.patchUptakeG)) < 1e-9, "every uptake transfer is charged once");
  const glucoseBefore = s.glucoseMass;
  setMusclePatch(s, 0);
  assert.ok(Math.abs(s.glucoseMass - glucoseBefore) < 1e-12);
  assert.ok(Math.abs(insulinLedger(s.multiscaleMeal).residual) < 1e-18);
  assert.ok(Math.abs(carbohydrateResidual(s)) < 1e-8);
});

test("E03: refinement resolves a radial insulin gradient but agrees with the coarse model in aggregate", () => {
  const run = (fraction: number) => {
    const s = body(fraction);
    applyAction(s, meal);
    advance(s, 1800);
    return s;
  };
  const coarse = run(0),
    refined = run(0.2),
    a = multiscaleMealReadout(coarse),
    b = multiscaleMealReadout(refined);
  const shells = b.patchShells.map((x) => x.insulinPM);
  for (let k = 1; k < shells.length; k++) assert.ok(shells[k] < shells[k - 1], "insulin falls away from the capillary");
  assert.ok(b.patchShells[0].surfaceGlut4Percent > b.patchShells[3].surfaceGlut4Percent);
  assert.ok(relative(b.muscleUptakeG + b.patchUptakeG, a.muscleUptakeG) < 0.01);
  assert.ok(Math.abs(glucose(refined) - glucose(coarse)) < 0.05);
});

test("E03: a refined recording resumes exactly and inspection does not change it", () => {
  const s = body(0.05);
  applyAction(s, meal);
  advance(s, 240);
  const text = JSON.stringify({ model: MODEL_VERSION, exportedAt: "2026-09-29", state: s, reference: null, scope: "test" });
  const resumed = parseRecording(text).state as BodyState;
  for (let i = 0; i < 20; i++) multiscaleMealReadout(resumed);
  advance(s, 120);
  advance(resumed, 120);
  assert.deepEqual(resumed, s);
  const broken = JSON.parse(text);
  broken.state.multiscaleMeal.patchInsulinMol[0] *= 2;
  assert.throws(() => parseRecording(JSON.stringify(broken)), /insulin ledger/);
});

test("0.3 recordings migrate only when the physical pathway was off", () => {
  const coarse = createBody() as unknown as Record<string, unknown>,
    meal = coarse.multiscaleMeal as Record<string, unknown>;
  for (const key of ["referenceVolumesL", "meanFlowsLPerS", "flowWindowL", "flowWindowSeconds", "pumpPhase", "betaCell", "primedPmol", "patchFraction", "patchInsulinMol", "patchSignal", "patchClearedMol", "patchUptakeG"]) delete meal[key];
  for (const id of PATCH_CELL_IDS) delete (coarse.transport as { compartments: Record<string, unknown> }).compartments[id];
  const payload = { model: "atlas-physiology-0.3.0-p4-experimental", exportedAt: "2026-09-22", state: coarse, reference: null, scope: "test" };
  assert.equal(parseRecording(JSON.stringify(payload)).state.multiscaleMeal.patchFraction, 0);
  meal.enabled = true;
  assert.throws(() => parseRecording(JSON.stringify(payload)), /active 0\.3/);
});
