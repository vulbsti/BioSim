# P1 implementation: local chemical mechanisms

Implemented 2026-09-10. **P1 is in progress.** The physical kernel, E01 fixture, source-model reproduction and visible mechanism workspace are implemented. Independent human validation endpoint mapping and acceptance bounds remain open; this does not complete M1 or introduce cellular coupling into the whole-body solver.

## Try it

Run `npm run dev`, then open `http://localhost:3016/#molecular`, or choose **Open molecular lab** below the physiology lab's introduction.

1. In **Receptor binding**, play or scrub the 20-minute response. Change ligand dose, receptor capacity or clearance and choose **Calculate response**. Setting receptor capacity to zero removes binding through the model equations.
2. Inspect blood, tissue, receptor and clearance readouts. Expand the reaction ledger to see cumulative transfers and the remaining inventories.
3. In **Insulin signaling**, inspect the archived 100 nM, 15-minute pulse. At withdrawal, input falls to zero while downstream responses recover over time. Try a lower concentration and recalculate.
4. Export an experiment, rewind, then reload it. The same model and inputs are recomputed and the recorded playhead is restored. Whole-body and molecular-lab recording formats are separate and reject incompatible imports.

## What changed

`app/simulation/core/units.ts` implements explicit conversion to mol, L and seconds, including concentration and first-/second-order rate units. Relative hormone activities are not accepted as physical concentrations.

`core/model.ts` compiles a bounded, typed reaction model: evidence, species with conserved moieties, constant-volume compartments, initial amounts, parameters and their ranges, single-owner pools, permissioned cross-module ports, transfer and mass-action reactions. Compilation rejects incompatible dimensions, unbalanced stoichiometry, missing references, duplicate owners and unauthorized pool writes. There is no arbitrary model-code execution or SBML importer.

`core/integrator.ts` advances public 0.25-second ticks with RK4 step-doubling inside each tick. Every accepted reaction extent is applied through the same stoichiometry to inventories and the cumulative ledger. Failed steps are retried at a smaller interval; negative values are not silently clipped. The previous state remains unchanged on failure. Checkpoints contain the full model contract, solver version, inventories and extents; import checks shape, finiteness and consistency with the ledger.

The E01 fixture has a 1 L blood reservoir, a 200 mL effective tissue bath, free ligand, free receptor, bound receptor and a clearance accounting pool. Its mechanisms are delivery, return, binding, dissociation and clearance. The default input is 100 pmol ligand with 20 pmol receptor; all rates are deliberately synthetic. Conserved ligand/receptor moieties are not a claim of full elemental, charge, energy or realistic fluid accounting. A bath is an effective mixing volume, not a registered tissue mesh.

The molecular lab computes trajectories in its own Web Worker. The renderer observes sampled trajectories; playback, chart scrubbing and selecting a mechanism do not advance or alter the underlying calculation. Parameter changes start a new computed experiment. Animated symbols represent populations; their positions and the vessel/cell drawing are schematic. Quantities and receptor activation come from the solved state. This is a local mechanism view, not the P2 Blender anatomy package.

## Published insulin model

The second experiment reproduces **Sedaghat, Sherman and Quon (2002), no-feedback variant**, using the archived JSim model 0166. Source `.mod` and `.proj` files, original copyright/copy notices, digitized source-paper data, native parameters, per-parameter provenance and hashes are retained in [the model package](../models/sedaghat2002/README.md). The archived source notes limitations in its feedback variant; that variant is excluded. [NIH/Physiome archive](https://www.imagwiki.nibib.nih.gov/physiome/jsim/models/webmodel/NSR/sedaghat2002insulinsignal)

The TypeScript transcription preserves the source's receptor binding/recycling, IRS-1/PI3K, lipid signaling, Akt/PKC and GLUT4 equations. It retains 21 archived states, including one inactive feedback state. The first 12 state concentrations are converted from M to pM for numerical conditioning; the remaining states retain percentages of initial source pools. Time is minutes internally, seconds in the view. Fixed RK4 steps are 0.0005 minutes; all stages respect the side of the insulin-input discontinuity they integrate.

This model has an externally maintained insulin concentration and source synthesis/degradation. It does **not** satisfy the closed finite-ligand contract of E01, and is not passed off as a fully conservative molecular body model. Its parameters come from mixed preparations, including adipocyte, rat liver and COS-7 work. It is not calibrated to human skeletal muscle. AS160 is not explicitly represented, and GLUT4 response is not yet debited as glucose uptake from body blood.

## Evidence recorded this increment

[The protocol](../validation/p1/protocol.json) fixes engineering comparisons and solver tolerances before reference generation. [The verification receipt](../validation/p1/verification.json) records inputs, versions, source hashes, actual numerical outputs and test execution. [The independent reference](../validation/p1/insulin-reference.json) is computed data, not experimental data.

For the default E01 run, the maximum inventory-versus-ledger residual was **1.72 × 10⁻²⁴ mol**. Ligand and receptor inventories, including the clearance sink, remained conserved in the tested run.

For the archived insulin pulse, source surface GLUT4 rises from 4 to **39.2832% of the initial pool at 15 minutes**, then falls to **4.42718% at 60 minutes**. These are simulated source-model outputs. The maximum absolute difference between the TypeScript trajectory and the independent Radau transcription was **6.96 × 10⁻⁹ in the native pM/percentage coordinates** over the recorded samples. BDF provided a second reference-solver check. These comparisons verify numerical reproduction; they do not establish biological validity for a person.

The suite also checks analytic clearance, analytic mixing, finite binding equilibrium, high-rate substepping, zero-dose/zero-receptor controls, unit/ownership/port errors, source pool invariants, step refinement, deterministic checkpoint resume and observation invariance. Browser tests check changing scene pixels, frozen paused frames, input perturbations, source withdrawal/recovery, export/import, invalid-import preservation, navigation and 390/320 px layouts.

The final production build passed **17 browser tests without retries**, covering the new molecular lab and existing physiology/anatomy views. The existing 18 physiology and 6 physical-anatomy numerical tests also passed; the new mechanism suite passes 11 tests. Type checking and the production build pass. [Browser receipt](../validation/p1/browser-verification.json).

Actual browser playback and desktop/mobile captures are saved under `outputs/verification/p1/`. Open `insulin-response.mp4` or `insulin-response.webm` for the recorded pulse and recovery. Recreate captures against a running local app with `node scripts/capture-molecular.mjs http://localhost:3016`. The receipt includes file hashes and the observed playhead. Generated screenshots and videos are local artifacts, excluded from Git.

## Reproduce the checks

```sh
npm run check
npm run test:multiscale
npm run verify:multiscale
npx playwright test tests/browser/molecular.spec.ts
npm run test:browser:production
npm run build
```

The ordinary checks consume the bundled independent reference; they require no Python installation or network. To regenerate that reference:

```sh
python3 -m venv work/p1/venv
work/p1/venv/bin/pip install -r validation/p1/reference-requirements.txt
work/p1/venv/bin/python scripts/reference-insulin.py
npm run verify:multiscale
```

The Python script independently derives original constants and integrates original M states with `scipy.integrate.solve_ivp`, explicitly splitting the pulse at 15 minutes. Solver settings, versions and script/protocol/source hashes accompany its output. It does not consume the browser's numeric parameter JSON. [SciPy solver documentation](https://docs.scipy.org/doc/scipy/reference/generated/scipy.integrate.solve_ivp.html)

## Remaining P1 gate and next implementation

The published-model reproduction gate is met. **Independent human endpoints and defensible acceptance bounds are not yet specified.** The human-muscle AS160 paper identified in the protocol is independent of the 2002 model, but its measured endpoint is absent from this model. A quantitative observation mapping or a better matched model/dataset is required; treating the archived Figure 10 points as independent human validation would be incorrect.

[The human endpoint review](../validation/p1/human-endpoint-review.json) now compares three candidates. Image colocalization cannot simply be substituted for a GLUT4 amount. The newer exofacial surface assay is a more direct candidate, but its spatial scope, paired donor data and measurement uncertainty must be resolved before setting bounds. No candidate has been fitted or admitted as a passed human validation test. [Bradley 2015](https://pmc.ncbi.nlm.nih.gov/articles/PMC4463815/), [Persson 2026](https://pmc.ncbi.nlm.nih.gov/articles/PMC13007217/).

Continue by resolving that model/data fit, recording the observation mapping and locking its acceptance bounds before calibration. Then P2 can admit the muscle/tissue/cell asset package, and P3/P4 can replace defined coarse mechanisms with physical transport and local cellular uptake. None of the new local responses currently feeds the legacy whole-body state, so legacy hormone effects cannot be double-counted by this increment.
