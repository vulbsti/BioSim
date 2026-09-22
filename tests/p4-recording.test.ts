import { test } from "node:test";
import assert from "node:assert/strict";
import { advance, createBody, MODEL_VERSION } from "../app/simulation/engine";
import { createMultiscaleMeal, setMultiscaleMeal } from "../app/simulation/multiscale-meal";
import { parseRecording } from "../app/simulation/recording";
import { STATE, initialCirculation } from "../app/circulation/model";
import { totalSubstance } from "../app/simulation/transport";
import type { BodyState } from "../app/simulation/types";

const payload = (state: BodyState, model = MODEL_VERSION) =>
  JSON.stringify({ model, exportedAt: "2026-09-22", state, reference: null, scope: "test" });
const altered = (change: (state: BodyState) => void) => {
  const state = createBody();
  change(state);
  return payload(state);
};

test("recording accepts conserved active P4 output and each supported sensitivity", () => {
  for (const sensitivity of [0, 0.35, 1] as const) {
    const state = createBody();
    setMultiscaleMeal(state, true, sensitivity);
    advance(state, 30);
    const restored = parseRecording(payload(state)).state;
    assert.deepEqual(restored, state);
    const y = restored.multiscaleMeal.circulation;
    assert.ok(Math.abs(y.slice(0, 10).reduce((a, b) => a + b, 0) - 5) < 1e-8);
    assert.ok(
      Math.abs(
        y[STATE.injected] -
          y.slice(STATE.insulin, STATE.injected).reduce((a, b) => a + b, 0)
      ) < 1e-18,
    );
  }
});

test("recording rejects malformed P4 dimensions, numeric values, and sensitivity", () => {
  for (const sensitivity of [-1, 0.5, 2])
    assert.throws(
      () => parseRecording(altered((state) => (state.multiscaleMeal.sensitivity = sensitivity as 1))),
      /sensitivity/,
    );
  assert.throws(
    () => parseRecording(altered((state) => (state.multiscaleMeal.circulation = []))),
    /circulation state/,
  );
  assert.throws(
    () =>
      parseRecording(
        altered((state) => ((state.multiscaleMeal.circulation as unknown[])[0] = "5")),
      ),
    /circulation state|finite/,
  );
  assert.throws(
    () => parseRecording(altered((state) => (state.multiscaleMeal.circulation[0] = -1))),
    /volume/,
  );
});

test("recording rejects broken insulin, secretion, signal, and uptake ledgers", () => {
  assert.throws(
    () => parseRecording(altered((state) => (state.multiscaleMeal.circulation[STATE.injected] = 1))),
    /insulin ledger/,
  );
  assert.throws(
    () => parseRecording(altered((state) => (state.multiscaleMeal.secretedPmol = 1))),
    /Secreted insulin/,
  );
  assert.throws(
    () => parseRecording(altered((state) => (state.multiscaleMeal.circulation[STATE.signal] = -1))),
    /signal state/,
  );
  assert.throws(
    () =>
      parseRecording(
        altered((state) => (state.multiscaleMeal.circulation[STATE.signal + 13] = 101)),
      ),
    /signal state|conserved pool/,
  );
  assert.throws(
    () => parseRecording(altered((state) => (state.multiscaleMeal.muscleUptakeG = -1))),
    /Negative multiscale meal ledger/,
  );
});

test("disabled P4 state cannot carry active circulation, ledgers, sensitivity, or cell contents", () => {
  assert.deepEqual(parseRecording(payload(createBody())).state.multiscaleMeal, createMultiscaleMeal());
  const mutations: Array<(state: BodyState) => void> = [
    (state) => (state.multiscaleMeal.sensitivity = 0.35),
    (state) => (state.multiscaleMeal.muscleUptakeG = 1),
    (state) => (state.multiscaleMeal.circulation[STATE.integratedFlow] = 1),
    (state) => {
      state.transport.compartments["muscle-cell"].amounts.glucose = 1;
      state.glucoseMass += 1;
      state.carbIn += 1;
    },
  ];
  for (const mutate of mutations)
    assert.throws(() => parseRecording(altered(mutate)), /Disabled multiscale meal state/);
});

test("genuine 0.2 migration adds an empty disabled cell without changing old inventories", () => {
  const old = createBody();
  delete (old as unknown as Record<string, unknown>).multiscaleMeal;
  delete old.transport.compartments["muscle-cell"];
  const before = {
    glucose: totalSubstance(old, "glucose"),
    aminoAcids: totalSubstance(old, "aminoAcids"),
    lipids: totalSubstance(old, "lipids"),
    compartments: structuredClone(old.transport.compartments),
  };
  const migrated = parseRecording(payload(old, "atlas-physiology-0.2.0")).state;
  assert.deepEqual(migrated.multiscaleMeal, createMultiscaleMeal());
  assert.deepEqual(migrated.transport.compartments["muscle-cell"], createBody().transport.compartments["muscle-cell"]);
  assert.deepEqual(
    Object.fromEntries(
      Object.entries(migrated.transport.compartments).filter(([id]) => id !== "muscle-cell"),
    ),
    before.compartments,
  );
  assert.equal(totalSubstance(migrated, "glucose"), before.glucose);
  assert.equal(totalSubstance(migrated, "aminoAcids"), before.aminoAcids);
  assert.equal(totalSubstance(migrated, "lipids"), before.lipids);
});

test("model identity cannot be relabeled to bypass migration or solver checks", () => {
  assert.throws(() => parseRecording(payload(createBody(), "atlas-physiology-client-copy")), /Expected/);
  assert.throws(() => parseRecording(payload(createBody(), "atlas-physiology-0.2.0")), /newer model/);
  assert.throws(
    () =>
      parseRecording(
        altered((state) => {
          state.multiscaleMeal.solver = "client-solver";
        }),
      ),
    /Incompatible/,
  );
  assert.equal(initialCirculation().length, createBody().multiscaleMeal.circulation.length);
});
