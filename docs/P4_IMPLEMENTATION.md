# P4 — body-owned meal-to-muscle engineering increment

Implemented 2026-09-22 on the `simulate` working tree, starting from `63deb04`. This is a partial P4 integration, not completion of M1 or human validation. The [execution plan](MULTISCALE_EXECUTION_PLAN.md) remains the acceptance authority.

## One body run owns the pathway

Enable **Experimental physical meal pathway** in the physiology lab’s food controls. The default remains the legacy comparison mode. The new branch lives in `BodyState.multiscaleMeal` and advances in the existing body worker; it is not a second meal lab.

1. Existing digestion removes carbohydrate from the gut and credits the existing portal glucose pool.
2. A declared synthetic secretion boundary reads arterial glucose, producing a physical insulin amount per unit time. Relative insulin activity is never relabeled as a concentration.
3. The existing P3 ten-node model transports this input from portal blood through the liver and systemic circulation into muscle interstitial fluid. Hepatic, renal and local removal have separate insulin ledgers.
4. Muscle interstitial insulin drives the archived Sedaghat receptor/signaling equations. Normal, reduced and blocked receptor-input settings affect this boundary; a sensitivity change does not reset the active circulation.
5. Ordinary capillary exchange still transports glucose between muscle blood and interstitium. The GLUT4-dependent synthetic flux separately transfers glucose from `muscle-tissue` to `muscle-cell`, debiting and crediting exactly once.
6. Experimental muscle glucose oxidation consumes the cell pool. Muscle lipid oxidation retains the original tissue source. The old direct relative-insulin term is excluded from experimental muscle fuel selection; other organs retain their coarse endocrine laws.
7. Arterial glucose, body nutrient totals, transport receipts and plots read the same authoritative glucose compartments. The new cell pool is included once in total glucose and carbohydrate conservation.

The extra `muscle-cell` compartment is empty in legacy mode. Disabling the branch returns its remaining glucose to interstitium before returning to legacy behavior. This is an explicit engineering coarsening operation, not a biological cell-emptying process.

## Tissue inspection observes the same state

With the branch enabled, **Explore tissue in 3D** opens the existing four-scale specimen with the current body time, physical interstitial insulin, surface GLUT4, arterial glucose and muscle uptake. GLUT4 display markers read that committed response. Camera, section, LOD and scale changes do not run a solver or change physical inventories. The independent tissue insulin preview and mouse excitation controls are hidden in this linked mode so their separate clocks cannot be mistaken for the body experiment.

Body playback can be controlled from the specimen. **Save body run** exports the complete body recording through its existing worker. Load it in body controls to resume. The standalone tissue lab retains its original view/preview format. Free-orbit camera position and spatial refinement are not added to body recordings by this increment.

## Compatibility and intervention boundaries

New body exports use `atlas-physiology-0.3.0-p4-experimental`. The physical branch has its own model and solver IDs. Genuine 0.2 body recordings migrate to an empty cell pool with the branch disabled; incompatible or malformed active states must be rejected before replacing the current run. Sensitivity interventions are recorded in the body event ledger.

The physical circuit uses fixed 0.01-second RK4 steps inside each one-second body step; the source signaling derivative converts minutes to seconds. Physical secretion is converted from pmol/min to mol/s. Glucose pools remain grams, with readouts converted to mg/min or mg/dL.

The experimental UI limits manual advances to five minutes and playback speed to 120× to bound uninterrupted worker work. These limits are an execution constraint, not evidence of physiological validity over long durations.

## What remains open

- **Different aggregate flow models:** physical insulin uses P3’s prescribed pulsatile circuit; glucose, water and other substrates use the body’s existing mean-flow graph. They are causally coupled but not a single hemodynamic solution. Hematocrit, distribution volumes and population sizes have not been unified.
- **Synthetic physiology:** beta-cell secretion, uptake capacity, cell volume and aggregate population mapping are engineering assumptions. Sedaghat is a mixed-preparation source model, not fitted human muscle. Its receptor observer does not consume insulin. No human predictive claim is supported.
- **Refinement:** one aggregate cell pool is not a population of anatomically registered cells. Conservative spatial refinement, weighted patch replacement and the full refinement round-trip gate remain open.
- **Anatomy and mechanics:** the existing Blender geometry remains representative. This work does not add force, ATP coupling, SR/T-tubules, NMJ, tendon mechanics or expert anatomy approval. See the [Blender review](BLENDER_ASSET_REVIEW_2026-09-22.md).
- **Human endpoint admission:** the [P4 endpoint protocol](../validation/p4/human-endpoint-protocol.json) selects the 75 g oral-glucose/60-minute human membrane-GLUT4 study as a candidate, but paired donor data, assay mapping and independence from source calibration remain unresolved. Numeric biological bounds remain unset; they must be frozen before fitting. [Goodyear et al., 1996](https://pubmed.ncbi.nlm.nih.gov/8690151/) measures membrane abundance and isolated-vesicle transport, which are not interchangeable with whole-body glucose disposal. [Kelley et al., 1988](https://www.jci.org/articles/view/113489) is a separate systemic tracer-disposal candidate requiring its own observation model.

## Verification

`npm run test:p4` covers the physical ownership/ledger path, interventions, replay, migration and invalid recordings. `tests/browser/p4-linked.spec.ts` exercises an actual worker run, body-to-tissue state equality through scale/LOD/sections, recording import/resume and narrow layouts. Existing numerical and production-browser suites must also pass on the final source snapshot.

See [the current inspection handoff](CONTINUATION_HANDOFF_2026-09-22.md) for exact outcomes, source identity, preserved failures, and evidence paths. Historical passing P1/P2/P3/P5 receipts are not silently promoted to validation of this changed body UI.
