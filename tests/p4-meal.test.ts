import { test } from "node:test";
import assert from "node:assert/strict";
import {
  advance,
  applyAction,
  carbohydrateResidual,
  createBody,
  glucose,
  MODEL_VERSION,
} from "../app/simulation/engine";
import {
  createMultiscaleMeal,
  multiscaleMealReadout,
  setMultiscaleMeal,
} from "../app/simulation/multiscale-meal";
import { parseRecording } from "../app/simulation/recording";
import { STATE } from "../app/circulation/model";

const meal = {
  kind: "meal",
  meal: { carbs: 75, protein: 0, fat: 0, water: 0, sodium: 0 },
} as const;
const run = (sensitivity: 1 | 0.35 | 0, carbs = 75, seconds = 600) => {
  const s = createBody();
  setMultiscaleMeal(s, true, sensitivity);
  if (carbs) applyAction(s, { ...meal, meal: { ...meal.meal, carbs } });
  advance(s, seconds);
  return s;
};

test("opt-in P4 pathway conserves body glucose and physical insulin ledgers", () => {
  const s = run(1),
    m = s.multiscaleMeal,
    y = m.circulation;
  assert.ok(Math.abs(carbohydrateResidual(s)) < 1e-8);
  assert.ok(m.muscleUptakeG > 0);
  assert.ok(s.transport.compartments["muscle-cell"].amounts.glucose > 0);
  const insulin = y.slice(STATE.insulin, STATE.hepaticCleared).reduce((a, b) => a + b, 0),
    cleared = y.slice(STATE.hepaticCleared, STATE.injected).reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(y[STATE.injected] - insulin - cleared) < 1e-18);
  assert.ok(
    s.transport.cumulativeFluxes.some(
      (f) =>
        f.from === "muscle-tissue" &&
        f.to === "muscle-cell" &&
        f.substance === "glucose" &&
        f.mechanism === "exchange",
    ),
  );
});

test("reduced receptor sensitivity propagates through Sedaghat before changing physical uptake", () => {
  const normal = run(1),
    reduced = run(0.35),
    a = multiscaleMealReadout(normal),
    b = multiscaleMealReadout(reduced);
  assert.ok(a.aktPercent > b.aktPercent * 2);
  assert.ok(a.surfaceGlut4Percent > b.surfaceGlut4Percent);
  // From a primed basal state (not an insulin-free start) the early contrast is smaller;
  // the causal claim is the ordering normal > reduced > blocked with a clear margin.
  assert.ok(a.muscleUptakeG > b.muscleUptakeG * 1.2);
  assert.ok(b.muscleUptakeG > multiscaleMealReadout(run(0)).muscleUptakeG);
  assert.ok(glucose(normal) < glucose(reduced));
});

test("null meal retains finite basal boundary and sensitivity has no direct glucose shortcut", () => {
  const normal = run(1, 0, 120),
    reduced = run(0.35, 0, 120);
  for (const s of [normal, reduced]) {
    assert.ok(Math.abs(carbohydrateResidual(s)) < 1e-8);
    assert.ok(
      Object.values(s.multiscaleMeal).every((v) => typeof v !== "number" || Number.isFinite(v)),
    );
  }
  assert.ok(normal.multiscaleMeal.lastSecretionPmolPerMin > 0);
  assert.ok(
    multiscaleMealReadout(normal).surfaceGlut4Percent >=
      multiscaleMealReadout(reduced).surfaceGlut4Percent,
  );
});

test("zero receptor input leaves physical insulin delivery intact but suppresses signaling", () => {
  const active = run(1, 75, 300),
    blocked = run(0, 75, 300),
    a = multiscaleMealReadout(active),
    b = multiscaleMealReadout(blocked);
  assert.ok(b.interstitialInsulinPM > 0);
  assert.ok(Math.abs(a.interstitialInsulinPM - b.interstitialInsulinPM) < 2);
  assert.ok(a.aktPercent > b.aktPercent + 0.02);
  assert.ok(a.surfaceGlut4Percent > b.surfaceGlut4Percent);
});

test("disabled mode is deterministic legacy behavior and toggling preserves glucose inventory", () => {
  const a = createBody(),
    b = createBody();
  applyAction(a, meal);
  applyAction(b, meal);
  advance(a, 300);
  advance(b, 300);
  assert.deepEqual(a, b);
  setMultiscaleMeal(a, true, 1);
  advance(a, 120);
  const before = a.glucoseMass;
  setMultiscaleMeal(a, false, 1);
  assert.equal(a.multiscaleMeal.enabled, false);
  assert.equal(a.transport.compartments["muscle-cell"].amounts.glucose, 0);
  assert.ok(Math.abs(a.glucoseMass - before) < 1e-12);
  assert.ok(Math.abs(carbohydrateResidual(a)) < 1e-8);
});

test("P4 recording resumes exactly, migrates legacy disabled, and rejects mixed model IDs", () => {
  const original = run(1, 75, 180),
    payload = {
      model: MODEL_VERSION,
      exportedAt: "2026-09-22",
      state: original,
      reference: null,
      scope: "test",
    };
  const resumed = parseRecording(JSON.stringify(payload)).state;
  advance(original, 120);
  advance(resumed, 120);
  assert.deepEqual(resumed, original);
  const oldState = structuredClone(createBody()) as Record<string, unknown>;
  delete oldState.multiscaleMeal;
  delete (oldState.transport as { compartments: Record<string, unknown> }).compartments[
    "muscle-cell"
  ];
  const migrated = parseRecording(
    JSON.stringify({ ...payload, model: "atlas-physiology-0.2.0", state: oldState }),
  ).state;
  assert.deepEqual(migrated.multiscaleMeal, createMultiscaleMeal());
  const mixed = structuredClone(payload);
  mixed.state.multiscaleMeal.version = "wrong";
  assert.throws(() => parseRecording(JSON.stringify(mixed)), /Incompatible/);
});

test("readouts and repeated pause observations cannot mutate the trajectory", () => {
  const a = run(1, 75, 120),
    b = structuredClone(a),
    before = JSON.stringify(a);
  for (let i = 0; i < 50; i++) multiscaleMealReadout(a);
  assert.equal(JSON.stringify(a), before);
  advance(a, 120);
  advance(b, 120);
  assert.deepEqual(a, b);
});
