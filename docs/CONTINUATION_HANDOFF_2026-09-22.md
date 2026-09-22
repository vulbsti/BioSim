# Human Atlas — inspection and P4 continuation

Prepared 2026-09-22 from branch `simulate`, starting at `63deb0415408b0ca1bce5492f6bfe54ddc076258`. Changes are local and uncommitted; no push or deployment is part of this increment. The [2026-09-18 handoff](CONTINUATION_HANDOFF_2026-09-18.md) preserves the earlier inventory and evidence.

## What changed

- Added an opt-in physical meal pathway inside the existing body state/worker. It uses existing digestion, P3 insulin transport and Sedaghat signaling, then transfers glucose from muscle interstitium into a separately owned cell pool. Muscle oxidation consumes that pool once, while lipid oxidation retains the existing tissue source.
- Connected the tissue explorer to committed body state. Its scale/LOD/section controls observe the same body time and response. Standalone insulin/excitation experiments remain separate when no physical body pathway is active.
- Added explicit new recording identity, legacy migration and strict physical-branch validation, plus intervention and replay tests.
- Added a reviewed human endpoint candidate protocol without inventing quantitative biological bounds or claiming a fit.
- Corrected README/roadmap status: P3 physical transport and P5 excitation groundwork already exist; P4 is now a partial body integration, not a completed M1 release.
- Audited all four editable Blender scenes, canonical file identity and previews. Saved read-only topology reports and an anatomical quality policy. Canonical Blender/GLB assets were not replaced.
- Strengthened P5 reference generation provenance to bind source, generation script and protocol; re-verification must check those hashes.

Read [P4 implementation and boundaries](P4_IMPLEMENTATION.md) and [Blender review](BLENDER_ASSET_REVIEW_2026-09-22.md) before extending either track.

## Parallel work and review

The user requested GPT-5.6 Sol and Luna subagents. Sol was available; the agent service rejected Luna as unavailable. That substitution was disclosed and the parallel implementation, regression and asset-inspection jobs used Sol. The primary agent reviewed proposals and changes, added body-to-tissue observation and browser tests, and rejected an initially proposed disconnected meal lab. Independent review also caught the capillary-versus-cell boundary, malformed recording acceptance, genuine legacy migration, lost lipid oxidation and the retained coarse muscle insulin term; these were returned for correction before final validation.

## Verification evidence

Evidence directory: `validation/current-2026-09-22/`. The baseline is a detached checkout at the starting commit so concurrent feature edits cannot change that test subject. Final-source evidence must be distinguished from it.

Start with the [consolidated regression summary](../validation/current-2026-09-22/final/summary.json) and [primary visual review](../validation/current-2026-09-22/final/primary-visual-review.json). Final mobile captures: [320 px](../validation/current-2026-09-22/final/p4-linked-320.png) and [390 px](../validation/current-2026-09-22/final/p4-linked-390.png).

Baseline numerical, type, source/asset and data-validator stages passed. The first complete production browser run passed **31/33**, with two whole-body animation tests timing out at 120 seconds. Trace inspection showed their state/visual assertions succeeding before slow software-rendered screenshot/interaction work exhausted the budget. A separate isolated physical-anatomy rerun passed **4/4**. Both reports are preserved. The two expensive test budgets were increased to 240 seconds; their assertions, screenshots and coverage were retained. This is a test execution fix, not evidence of improved device performance.

The integrated-source verification finished with these results:

| Check | Result |
|---|---|
| Physiology / anatomy / molecular / tissue / circulation / P4 tests | 18 + 6 + 11 + 5 + 6 + 13 = **59 passed** |
| P1 numerical / P2 assets / P3 circulation / P5 excitation verification | **All four passed** |
| Complete production browser suite | **36/36 passed**, 6.6 minutes |
| Final linked-body production browser checks | **3/3 passed**, 20.4 seconds |
| Type checking and production build | **Passed**, repeated after the final UI adjustment |

The full suite ran against the snapshot in `final/source-files.previsual-full-suite.sha256`. Subsequent changes only scoped the linked panel's readability styles/class and expanded its existing browser test to verify play/pause. The final three browser checks used `final/source-files.final.sha256` and covered state-preserving scale/LOD/section inspection, save/load/resume, intervention comparison, shared playback, pause freezing and 320/390 px layouts. Numerical implementation files did not change between these snapshots. Logs and reports are under [the current evidence directory](../validation/current-2026-09-22/); `final/status.tsv` preserves each attempt rather than rewriting failed history as a pass.

The first targeted linked test exposed a test-side race: Playwright's immediate checkbox verification ran before the worker acknowledgment. The corrected test clicks and then waits for the controlled checkbox state; no behavioral assertion was removed. Its failed report is preserved separately from the passing reruns.

The primary agent visually inspected all four tissue scales in the browser, including a five-minute linked meal run on desktop and the fiber view at 390 px. Final production screenshots at 320 and 390 px were inspected after increasing linked-panel label/unit sizes, contrast, button height and spacing. The new panel's declared text/background contrast ranges from 5.80:1 to 7.38:1. This review verifies this panel's readability and layout; the Blender morphology findings below remain unresolved.

The disabled pathway was compared against the original commit at 0, 300 and 3,600 seconds: all legacy numerical fields were identical (maximum absolute difference 0). Only the new empty cell state and version metadata were excluded. See [legacy equivalence](../validation/current-2026-09-22/final/legacy-equivalence.json).

The [600-second response comparison](../validation/current-2026-09-22/p4/response-metrics.json) uses 75 g carbohydrate and records cumulative muscle uptake of 0.4436 g / 0.2857 g / 0.2000 g for normal / reduced / blocked receptor input. Arterial glucose is 112.25 / 112.51 / 112.65 mg/dL. The no-meal control is also retained. Carbohydrate residual magnitudes remain at or below 1.36e-13 g and insulin residuals below 5.39e-23 mol. These are deterministic engineering checks of the synthetic pathway, not human efficacy or clinical acceptance bounds.

## Blender decision

Current asset claim remains `representative_visual_prototype`. The fascicle/fiber geometry is regular procedural teaching geometry. It lacks measured architecture, registered microanatomy, connective tissue and cell ultrastructure needed for the requested high fidelity. Coincident UV seam vertices also make apparently closed procedural surfaces topologically open; intentional windows and source-surface defects are separately identified.

The next authoring target is one reviewed human vastus-lateralis cell neighborhood, using calibrated, licensed imaging and a measurement/provenance ledger. The review defines exact morphology, topology, material, registration, dynamic, LOD/device and reproducibility gates. Anatomical review and biological validation remain pending. Do not regenerate a larger generic rod bundle and call it higher anatomical quality.

## Remaining P4/M1 gates

1. Unify or validate the mapping between the separate pulsatile insulin circuit and mean-flow glucose circuit, their volumes and represented populations.
2. Replace or fit synthetic secretion/uptake laws using admitted human observations. The selected oral-glucose GLUT4 assay requires paired data, measurement mapping and independence checks before bounds can be frozen.
3. Add conserved spatial refinement/aggregation of a muscle patch; one aggregate cell compartment is not a spatial population model.
4. Obtain evidence-led anatomy and reviewer approval; existing assets do not meet the user’s anatomical quality target.
5. Measure sustained execution and rendering on named target devices. Software-rendered test duration is not a GPU/device benchmark.

P5 still needs the functional nerve/NMJ/force/load/energy path. Its mouse fixed-length excitation reproduction does not fulfill that milestone. P6–P10 remain planned. No complete-body or clinically validated simulation claim is supported.

## Continue locally

`npm run dev` serves port 3016. In food controls select the experimental sensitivity, introduce a meal, advance, and inspect muscle or open the tissue explorer. Export the body run to save physical pathway state. Use `npm run test:p4`, the existing numerical verification commands and `npm run test:browser:production` for regression; keep raw output away from old passing receipts until inspected.
