# Human Atlas — continuation handoff

Prepared 2026-09-18. Workspace: `/home/vulbsti/proj/human_atlas`. All paths below are relative to that directory unless absolute. This document is the entry point for the next agent; it summarizes implementation, evidence, limitations, and the next work. The original objective remains active and incomplete.

## 1. Read this first

The user's objective is:

> Continue the previous tasks that were being done. Use Blender and other tools to design new assets and build a complete replica of human body simulation. Down to molecular level. Current system doesn't look visually the same as how it happens in the body. We need a visual replica of human body simulation.

The latest instruction was to inspect and summarize everything implemented/tested and everything remaining, save a continuation document, and use **Luna subagents for inspection with the primary agent orchestrating**. Implementation was paused to prepare this handoff. Do not mistake a successful local increment for completion of the full objective.

Current state is an exploratory multiscale application with several working, partly connected models. It is **not** a complete human replica, a whole-body molecular simulation, or a human-validated digital twin. Numerical reproduction, source anatomy, attractive rendering, source-model validity, and human biological validity are separate evidence categories.

The latest code snapshot inspected for this handoff is:

- Branch: `simulate`.
- Commit: `171afdfc4f28cac3752c47724dc2616c0d98b221`.
- Commit date: 2026-09-17; title: `Multiscale muscle prototype: molecular/tissue/circulation labs with P1-P3 verification`.
- Despite its title, this commit also contains the recent sarcomere and Shorten excitation work described below.
- The worktree was **clean** before this handoff was added. Earlier conversation statements about many uncommitted files are now stale.
- A separate ignored worktree exists at `.worktrees/pre-female-removal`, detached at `d72b4f6`. Do not delete, reset, or merge it casually.
- No deployment or push was performed as part of these latest increments. The public-demo link in README is not proof that these features are deployed.

Keep the full objective intact. `docs/MULTISCALE_EXECUTION_PLAN.md` breaks it into finite research/engineering milestones; completing one of those does not prove the original full-body objective complete.

## 2. Start and inspect the application

```sh
cd /home/vulbsti/proj/human_atlas
npm run dev
```

The development server uses port **3016**. Check for an existing server before starting another. The current application is Vite + React + Three.js, not a running Next.js server, despite Next-style source directory names and some dependencies.

| URL | Workspace | What to inspect |
|---|---|---|
| `http://localhost:3016/` | Whole-body physiology | Inputs, time, transport, hormones, cerebral network, animated anatomy |
| `http://localhost:3016/#anatomy` | Source atlas | Search, selection, systems, isolate, exploded view |
| `http://localhost:3016/#molecular` | Local mechanism lab | Conservative receptor-binding fixture and archived insulin signaling |
| `http://localhost:3016/#tissue` | Blender tissue explorer | Muscle → fascicle → fiber → sarcomere; manual sliding and optional excitation |
| `http://localhost:3016/#circulation` | Physical circulation pilot | Pulsatile flow, finite insulin transport, local source-model signaling |

Routing is in `web/main.tsx`. The physiology workspace is retained after first mounting; the other workspaces mount/unmount on navigation. Tissue scale changes preserve the tissue experiment, but leaving the tissue workspace is not automatic durable session continuation—save a view first.

For the newest feature: open `#tissue`, select **Sarcomere**, then enable **Show the fixed-length activation experiment**. Allow several seconds for the worker to calculate. Scrub/play a single pulse or nine-pulse 20 Hz train. Compare **Source release rate** with **Block SR release**. An in-scene play/pause button lets you watch the mesh while calcium is displayed. Disable the experiment to return to manual length inspection.

## 3. Architecture and ownership: what is connected, and what is not

| Component | Owns/solves | Receives/feeds | Boundary |
|---|---|---|---|
| Legacy body engine | Organ state, relative hormones, coarse transport and budgets | User inputs → worker → body UI/anatomical motion | No integrated physical cellular/molecular body solver |
| P1 finite binding kernel | Amounts and reaction extents in a small chemical model | Parameters → calculated local trajectory | Synthetic local fixture, separate from body state |
| Sedaghat insulin model | 21 source signaling states | Maintained insulin pulse in molecular/tissue lab; interstitial insulin in circulation lab | Mixed preparations; no human muscle fit; no body glucose debit |
| P3 circulation | Ten blood compartments, physical insulin, interstitial pool, clearance ledgers | Finite insulin input → flow/transport → Sedaghat observer | Synthetic closed loop; not the legacy body's authoritative circulation |
| Blender tissue scene | Geometry, selection, sections, camera and LOD | Reads playheads/state; does not solve physiology | Representative microscopic placement, not donor registration |
| Manual sarcomere inspection | Prescribed length and filament translations | User slider → Z-disc/thin-filament motion | Kinematics, not force-driven contraction |
| Shorten excitation | 56 archived source states | Electrical current → membrane/tubule voltage → calcium → regulatory/cross-bridge states | Mouse source, fixed-length visualization, no motor neuron/NMJ/load solver |

There are separate time domains: legacy body seconds, Sedaghat source minutes (displayed as seconds), circulation seconds, and Shorten milliseconds. Tissue insulin and excitation have **separate playheads**. Never reinterpret relative endocrine activity as a physical concentration, or attach a force label to a source cross-bridge concentration.

## 4. Implemented work, by area

### 4.1 Source anatomy and physical display

The existing reference assembly contains 2,273 selectable meshes, 3,457 concepts, 15 display systems and approximately 2.55 million triangles in its recorded baseline. Sources include BodyParts3D 4.0, 34 additive 4.3 thyroid/parathyroid/cranial-venous meshes, and five older lung-lobe surfaces. The older lung alignment is approximate. This is a mixed reference assembly, not a complete single-person scan.

Important files:

- `app/atlas-loader.ts`, `app/anatomy.ts`, `app/page.tsx`, `app/scene.tsx`.
- `app/explosion-layout.ts`, `app/pointer-tap.ts`, `app/agent-tools.ts`.
- `app/physical/PhysicalScene.tsx`, `anatomy-view.ts`, `motion.ts`, `flow-routes.ts`.
- `docs/PHYSICAL_ANATOMY.md`, `docs/anatomy-expansion-provenance.json`, `docs/lung-surface-provenance.json`, `public/ATTRIBUTION.md`.

Implemented: source selection/search/system controls, isolation, exploded layouts, display grouping corrections, section planes, heart/lung/diaphragm/digestive motion, approximate blood/air paths and visible error states. Source identity is retained. Anatomical animation uses current rates and its own visual clock; it is not a finite-element tissue mechanics calculation. Approximate tracer routes do not establish vessel junctions or solve local fluid velocity fields.

Cerebral coverage audit is in `app/simulation/brain-coverage.ts`, `BrainCoverage.tsx`, `scripts/audit-brain-vessels.ts`, and `docs/brain-vessel-coverage.json`. The inspected receipt records 178 candidates: 83 exact-name links, 62 grouped territories, 31 unresolved and two adjacent-circulation items. Exact-name matches, grouped territories and unresolved structures must remain distinct; these are not proven geometric connections. Historical counts differ between source snapshots; rerun `npm run audit:brain` after changing atlas sources.

### 4.2 Legacy whole-body exploratory physiology

Files: `app/simulation/{types,engine,transport,endocrine,brain,scenarios,recording,use-simulation}.ts`, `simulation.worker.ts`, `Simulator.tsx`, and accompanying views/styles.

Implemented inputs include meals, water, inspired O₂/CO₂, exercise, temperature, sensory inputs, light and sleep. The one-second worker advances circulation/gas exchange, digestion/absorption/storage/excretion, fluid proxies, 31 relative endocrine activities, and modeled substrate accounting. Five coarse substance categories move through 23 blood/tissue/lymph-transit compartments. Transfers expose source/destination receipts. A 34-node/55-path cerebral resistance schematic is coupled to an allocated body flow. Scheduling, presets, comparisons, export/import and deterministic resume exist.

Limits: hormones are largely relative activities, many organ laws are reduced/proxy relationships, distal vascular territories are grouped, and the nervous system is not a functional connectome. No universal biological validation is established. See `docs/PHYSIOLOGY_MODEL.md` for individual equations and limits.

### 4.3 P1 chemical kernel and molecular lab

Files: `app/simulation/core/{units,model,integrator,binding-fixture}.ts`; `app/molecular/*`; `models/sedaghat2002/*`; `scripts/reference-insulin.py`; `scripts/verify-multiscale.ts`.

Implemented physical-unit conversion; species/compartment/reaction/evidence contracts; ownership and permissioned ports; dimensional and stoichiometric checks; cumulative reaction extents; adaptive RK4 step doubling; fixed public 0.25-second ticks; immutable-on-failure updates; checked checkpoint import/export.

E01 is a finite ligand/receptor fixture with a 1 L blood reservoir, 200 mL effective tissue bath, delivery/return, binding/dissociation and a clearance ledger. It has synthetic parameters. Conservation is of declared moieties, not full elemental/charge/energy physiology.

The insulin experiment reproduces the archived **Sedaghat/Sherman/Quon 2002 no-feedback JSim variant**. It retains 21 states, source notices, parameters, digitized data and provenance. It uses RK4 at 0.0005 minutes, with explicit input discontinuity handling. The first 12 concentrations are rescaled from M to pM; remaining source states are pool percentages. It includes receptor cycling, IRS-1/PI3K, lipid signaling, Akt/PKC and GLUT4. AS160 is absent. Source synthesis/degradation and a maintained extracellular input mean this is not the closed E01 model.

Worker-calculated trajectories support playback/scrub, parameter recomputation, population animations, ledgers, comparison readouts and recording. The source comes from mixed preparations; its response is not a human skeletal-muscle calibration and does not yet contribute a glucose-uptake debit to the body.

### 4.4 P2 Blender tissue package and sarcomere

Authoring: `scripts/blender/build-muscle-pilot.py`. Specification and editable files: `assets/multiscale/muscle-pilot/`. Runtime: `public/models/multiscale/muscle-pilot/`. Scene/selection/recording: `app/tissue/`. Independent byte inspector: `scripts/lib/inspect-tissue.mjs`.

The package is **0.2.0**, in meters, with SHA-256/byte validation before runtime GLB import, semantic entity IDs and two LODs. It contains:

| Scale | Contents | Detail / context triangles |
|---|---|---|
| Muscle | Source right vastus lateralis `FJ1442`, femur `FJ3365`, patella `FJ3381` | 2,704 / 2,704 |
| Fascicle | 37 fiber segments, opened perimysium, five interstitial capillary segments | 5,816 / 2,928 |
| Fiber | Open sarcolemma, packed painted myofibrils, nuclei, mitochondria, capillary/RBCs, GLUT4 markers | 31,696 / 16,224 |
| Sarcomere | 91 thick filaments, interstitial thin arrays, two Z-disc grids, M-line links, sparse detail heads | 47,000 / 13,304 |

Editable `.blend` scenes exist for all four scales. Detail sarcomere GLB: 2,298,852 bytes; context: 639,892 bytes. Six semantic entities are present at both sarcomere LODs. Generated microstructures and texture are original MIT work; source anatomy retains its own licenses.

Implemented inspection: source location link, breadcrumb scales, preserved selection/LOD, orbit, front/cut-end presets, optional sheath/bone visibility, cross/longitudinal clipping, metric scale bar, data/identity validation, disposal of assets/contexts on navigation and save/load. Clipped surfaces are intentionally open; there is no generated cut-surface cap.

Manual sarcomere behavior (`app/tissue/sarcomere.ts`): thick length 1.6 µm, thin length 1.0 µm, rest span 2.5 µm, inspection range 2.0–3.2 µm. Each Z disc and its attached thin array translate by `side * (L - 2.5 µm)/2`; thick array/M line stay fixed. A band remains 1.6 µm; half I band is `(L - 1.6 µm)/2`; H zone is `max(0, L - 2.0 µm)`. No force law is implied. A visual review found maximum extension clipping both Z discs; default camera distance was increased by 1.35 and the correction was recaptured.

### 4.5 P3 physical circulation pilot

Files: `app/circulation/*`, `scripts/reference-circulation.py`, `scripts/verify-circulation.ts`, `tests/circulation.test.ts` and `validation/p3/`.

A ten-compartment closed loop models systemic veins, right pump, pulmonary circulation, left pump, systemic artery, portal/liver, muscle, renal and remaining systemic beds. Pressure/compliance determines signed flow; upwind plasma concentration follows the flow direction. Fixed hematocrit distinguishes plasma and erythrocyte volumes. A finite 5–25-second insulin input enters portal or systemic venous blood. Explicit interstitial exchange and hepatic/renal/local clearance have retained ledgers. UI interventions include route, clearance, exchange and muscle resistance. Replay preserves the experiment and returns paused.

The prescribed pump is a normalized half-sine ejection at 72 bpm, averaging 5 L/min. It is not an explicit ventricular/valve model. Coefficients are synthetic. The Sedaghat pathway observes muscle interstitial insulin through unit/time conversion; its receptors do not consume physical insulin or own transport flux. This is the implemented circulation-to-local-signaling link, not a complete meal → muscle uptake → body feedback loop.

### 4.6 New Shorten excitation work: source-grounded activation

Files:

- `models/shorten2007/{manifest.json,README.md,source/shorten2007.cellml,source/shorten2007.c,source/shorten2007.py}`.
- `scripts/generate-shorten.mjs` → `app/tissue/generated/shorten.ts`.
- `app/tissue/excitation.ts`, `excitation.worker.ts`, `use-excitation.ts`, `ExcitationPanel.tsx`.
- `scripts/reference-excitation.py`, `scripts/verify-excitation.ts`, `scripts/capture-excitation.mjs`.
- `validation/p5/excitation-{protocol,reference,verification,browser-report}.json`.
- `tests/browser/excitation.spec.ts`; extra recording assertions in `tests/tissue.test.ts`.

Pinned source: Shorten, O'Callaghan, Davidson and Soboleva (2007), fast-twitch **mouse** muscle; Physiome Model Repository changeset `33944b1d8ee3227ebd32df9a7b1116c649632145`, exposure `159ba2f081022ca651284404f39eeb40`. The source is CC BY 3.0; author/encoding metadata and downloaded bytes are retained. Temperature remains the source 293 K. It is not fitted to humans.

The generator mechanically translates the C assignment equations into TypeScript, retaining all **56 states, 105 constants and 71 algebraic variables**. Do not hand-edit the generated file. A separate archived Python export is integrated with SciPy BDF for comparison.

Runtime: Dormand–Prince 5(4), relative tolerance `1e-6`, absolute floor `1e-9` in source state coordinates, maximum internal step 0.05 ms, half-millisecond event boundaries and output samples. The 500 ms experiment generally needs roughly 265k–291k accepted steps and several wall-clock seconds. It runs in a worker. No state clipping is used to hide instability; integration has finite/error/positivity/budget checks.

Inputs: one 150 µA/cm², 0.5 ms pulse; the source nine-pulse 20 Hz train; or no stimulus. SR release can be disabled by scaling source constant 98 to zero. This is an idealized mechanism perturbation, not a calibrated drug intervention. The wrapper disables the hardcoded source current with source time -1, then adds the selected current divided by capacitance to the surface-voltage derivative. No other source equation explicitly depends on time.

Solved/read out: surface and T-tubule membrane voltage, calcium transport/buffering, regulatory-unit states, pre/post-stroke bridge pools and phosphate. Inventory diagnostics include modeled calcium and adenine pools. These checks do not establish complete ATP hydrolysis, energy conservation or physical force.

The scene reads doubly calcium-bound regulatory units and post-stroke concentration for thin/thick filament tint. Brightness uses declared display scales; it is not a count of molecules or a resolved molecular pose. The source has no load/shortening state, so excitation mode **holds the displayed sarcomere at 2.50 µm** and disables manual length changes. Disabling excitation restores manual inspection. The fixed geometry length is not fed back into source kinetics. A fiber-level activation tint also exists. Molecular actin/myosin conformations and individual head cycling are still absent.

Controls, time plots, slow-motion playback, scene play/pause, interventions, worker loading/errors, scale changes and save/load are implemented. The archived initial state is not steady state: even no-stimulus runs have a settling response. The UI discloses this.

## 5. Recording and version compatibility

- Body, molecular, circulation and tissue recordings are separate formats. Do not interchange them or silently reinterpret state.
- Tissue package 0.2.0 saves scale, LOD, selection at each scale, visibility, section, camera preset, manual length and insulin playhead. Free-orbit camera pose is not serialized.
- Excitation adds `enabled`, stimulus/release config and millisecond playhead, plus explicit model/solver IDs. Import recomputes and restores paused; validation runs before replacing the view.
- Older 0.2.0 tissue views without excitation fields explicitly default to excitation disabled. Older 0.1.0 package/hash recordings are rejected.
- Package bytes/hashes, model and solver versions are compatibility contracts. Changing equations or generated source requires deliberate version/recording policy work; do not reuse an old ID for incompatible behavior.

## 6. What was actually tested

These are different evidence scopes. Do not report all rows as a fresh full-project test run.

| Evidence | Recorded outcome | Recency and scope |
|---|---|---|
| `npm run check` | Passed; exit 0 | Latest excitation implementation; terminal completion collected during this handoff |
| Production Vite build | Passed; existing large-chunk warning | Run as part of latest production-browser suite |
| `git diff --check` | Passed | Latest implementation/handoff preparation |
| `validation/p1/verification.json` | P1 mechanism/source verification passed; TAP has 11 tests | Historical numerical run; all 16 recorded source hashes match current files |
| `validation/p1/browser-verification.json` | 17 passed, zero retries/failures | 2026-09-09/10 historical molecular + body/anatomy build |
| `validation/p2/asset-verification.json` | Five tests, eight GLBs passed | 2026-09-17; current sarcomere/recording increment |
| `validation/p2/browser-verification.json` | 23 passed, zero failures/flaky | 2026-09-12 historical three-scale package; not current excitation evidence |
| `validation/p2/sarcomere-verification.json` | 13 targeted production browser tests passed | 2026-09-17 before excitation addition |
| `validation/p3/verification.json` | Six tests; independent reference, invariants and 32 corners passed | Historical numerical run; all nine recorded source hashes match current files |
| `validation/p5/excitation-verification.json` | Four full-state reference comparisons + tighter-tolerance/invariant/intervention checks passed | 2026-09-17; new source model |
| `validation/p5/excitation-browser-report.json` | **16 passed**, zero skipped/unexpected/flaky; 59.9844 s | Final run starts `2026-09-17T06:04:39.153Z`; includes in-scene activation controls |

The final 16-browser-test run covers **four circulation + three excitation + three sarcomere + six tissue** tests. It does **not** rerun the molecular, legacy simulation or physical-anatomy browser suites. Those remain historical evidence until rerun on the current snapshot.

Numerical test files currently contain 18 legacy physiology tests, six physical-anatomy tests, 11 multiscale tests, five tissue tests and six circulation tests. Their mere existence is not a fresh passing result. `npm test` runs these plus the general browser suite, but does **not** include `verify:excitation`; run that command separately.

### Latest excitation numerical results

Across all four scenarios, compared against independently integrated archived Python equations:

- Maximum membrane/tubule voltage difference: about `1.842e-5 mV`.
- Maximum sampled calcium difference: about `3.494e-6 µM`.
- Maximum pre/post-stroke difference: about `2.104e-8 µM`.
- Maximum scaled error across all 56 states: about `0.01126`, below the locked bound 1.
- Largest calcium-inventory residual: about `7.184e-32 mol`.
- Largest adenine-inventory residual: about `4.368e-31 mol`.
- Single-pulse peak sampled calcium: about `7.75377 µM`; peak sampled post-stroke pool: `0.723236 µM`.
- Blocked-release peak calcium: `0.251310 µM`, with the electrical action potential retained.
- Original waveform equality, finite/nonnegative output, observation invariance and tighter-tolerance comparison passed.

These are solver-reproduction and bookkeeping results. There is no independent human-data validation or source-paper figure reproduction claim for the full fatigue experiment.

### Other recorded numerical results

- P1 E01 inventory/extent residual: approximately `1.72e-24 mol` in the recorded default fixture.
- P1 source GLUT4: `39.2832%` at 15 minutes and `4.42718%` at 60 minutes; native-coordinate independent-reference difference about `6.96e-9`. These are source-model outputs.
- P3 independent-reference maxima: pressure about `1.167e-4 mmHg`; insulin about `1.296e-4 pM`; GLUT4 about `2.355e-8` percentage points. Default blood-volume residual about `9.859e-14 L`, insulin residual about `5.343e-23 mol`.

### Browser and visual coverage

Latest tests exercise visible frame changes, freeze-on-pause, selection, moved-mesh picking, section cuts, LOD changes, consistent playheads across scale, valid/invalid replay, loading failure, interventions, preserved fixed length, and 320/390 px layouts. Excitation intervention tests compare displayed 5 ms calcium against the independent reference.

An initial browser assertion incorrectly expected a tenfold calcium reduction at **5 ms**. The actual reference is about `1.68750 µM` versus `0.213322 µM` (roughly eightfold); peak reduction is greater than tenfold. The test was corrected to compare against the independent reference, and the final run passed. No source parameter, solver tolerance or numerical acceptance bound was changed to accommodate that test.

Rendered evidence includes Blender previews and real Chromium screenshots/videos. Latest excitation captures have zero page errors and no mobile horizontal overflow. The desktop 10 ms and mobile train view were visually inspected. This verifies layout and state-driven overlay rendering, not realistic molecular conformation or human physiology. CPU submission time is not GPU frame time.

## 7. Reproduction commands and tools

### Build and browser

```sh
npm run check
npm run build
npm run test:browser:production -- tests/browser/excitation.spec.ts tests/browser/tissue.spec.ts tests/browser/sarcomere.spec.ts tests/browser/circulation.spec.ts
```

To produce a structured browser report without overwriting the tracked passing receipt:

```sh
atlas_report_dir="$(mktemp -d /tmp/human-atlas-browser.XXXXXX)"
PLAYWRIGHT_JSON_OUTPUT_FILE="$atlas_report_dir/excitation-browser-report.json" npm run test:browser:production -- tests/browser/excitation.spec.ts tests/browser/tissue.spec.ts tests/browser/sarcomere.spec.ts tests/browser/circulation.spec.ts --reporter=line,json
```

Inspect the exit status and report before deliberately replacing any tracked receipt. The historical command used the same specs/reporters with `PLAYWRIGHT_JSON_OUTPUT_FILE=validation/p5/excitation-browser-report.json`.

`playwright.production.config.ts` builds and serves port **4317**, uses one worker and does not reuse an existing server. The development configuration uses port 3016, allows reuse, and uses two workers. Prefer the production configuration for moving/frozen-frame checks so HMR cannot invalidate captures. Channel is `chromium`; install the browser with `npx playwright install chromium` only if needed.

### Numerical checks

```sh
npm run test:physiology
npm run test:anatomy
npm run verify:multiscale
npm run verify:tissue
npm run verify:circulation
npm run verify:excitation
```

The verification commands write receipts. Ordinary verification consumes checked-in reference outputs and does not need network access. Regenerate references only when source/protocol/solver changes justify it; retain the old evidence if comparisons fail.

```sh
work/p1/venv/bin/python scripts/reference-insulin.py
work/p1/venv/bin/python scripts/reference-circulation.py
work/p1/venv/bin/python scripts/reference-excitation.py
npm run generate:excitation
```

The existing Python environment used SciPy 1.17.1. Original bootstrap requirements are in `validation/p1/reference-requirements.txt`. Do not assume a fresh machine has `work/`, browser binaries or Blender.

### Blender and assets

```sh
work/tools/blender-4.4.3-linux-x64/blender --background --factory-startup --python scripts/blender/build-muscle-pilot.py
npm run verify:tissue
```

Local Blender 4.4.3 was verified runnable. The `game-dev` CLI was absent; the existing explicit Blender script and independent repository inspector were used instead. No paid generation was used, and no plugin package-certification claim is made. Rebuilding replaces generated GLBs, scenes, texture, previews and manifests; it does not replace original atlas buffers. Existing saved-view hashes may become incompatible.

### Captures and audits

```sh
node scripts/capture-molecular.mjs http://localhost:3016
node scripts/capture-tissue.mjs http://localhost:3016
node scripts/capture-sarcomere.mjs http://127.0.0.1:3016
node scripts/capture-excitation.mjs http://127.0.0.1:3016
npm run audit:brain
npx tsx scripts/audit-multiscale-baseline.ts
node scripts/validate-atlas.mjs
node scripts/validate-interactions.mjs
```

These are available commands, not a claim they were all rerun for this handoff. Inspect target paths and existing reports before overwriting audit/capture evidence.

## 8. Artifact locations and preservation

```text
app/                                  runtime and UI source
assets/multiscale/muscle-pilot/         specification, editable Blender scenes, build receipt
public/models/multiscale/muscle-pilot/  eight GLBs and versioned/hash manifest
models/sedaghat2002/                   original insulin source and provenance
models/shorten2007/                    original CellML/C/Python and provenance
validation/p1/                        binding/insulin numerical + historical browser evidence
validation/p2/                        asset + historical tissue/sarcomere evidence
validation/p3/                        circulation reference and numerical evidence
validation/p5/                        excitation protocol/reference/numerical/browser evidence
outputs/verification/p1/               molecular screenshots/video/capture receipt
outputs/verification/p2/               tissue Blender/browser renders and video
outputs/verification/p2/sarcomere/     length/oblique/mobile screenshots + capture.json
outputs/verification/p5/               excitation screenshots + capture.json
work/p1/venv/                         local SciPy environment
work/tools/blender-4.4.3-linux-x64/    portable Blender
.worktrees/pre-female-removal/        separate historical checkout; preserve
```

`outputs/`, `work/`, `dist/`, `test-results/`, Playwright reports, `.worktrees/`, Blender backups and Python bytecode are ignored. A fresh Git clone will not have those local screenshots/videos/tools. Tracked model/asset/receipt files are the portable source; capture scripts regenerate local visual artifacts. Excitation reference output is approximately 4.3 MB and contains all 56 states at all samples for four scenarios.

Never print `.env` contents or credentials during handoff inspection. Preserve source licenses: BodyParts3D versions differ; original project geometry is MIT; archived insulin code has its University of Washington copying notice; Shorten model is CC BY 3.0.

## 9. Work and tests still required

| Area | Still required | Evidence needed before declaring it done |
|---|---|---|
| P1 human endpoints | Select a human dataset/observable the model actually represents; AS160 is absent and colocalization is not a GLUT4 amount | Pinned dataset/preparation, observation mapping, calibration/held-out split, locked bounds, measured-vs-predicted results |
| P2 anatomical fidelity | Reviewed muscle microstructure placement; registered brain-region package; realistic tissue/material/deformation work | Source/license/landmark receipts, reviewer findings, spatial uncertainty, deformation/picking parity, exported-runtime visual review |
| P2 performance | Measured device frame time, GPU/memory residency, repeated scale-switch stress | Named device/browser/resolution, p95 timing, memory/resource stability; CPU submit time alone is insufficient |
| P3 physiological circulation | Reviewed vascular topology; actual ventricular/valve mechanics; O₂/Hb and CO₂/buffer chemistry; human waveforms; body integration | Flow/volume/gas/amount balances, measured pressure/flow/transport endpoints, convergence, perturbations, single-owner replacement |
| P4 meal → muscle → body | Physiological secretion, perfused cell population, receptor/signaling uptake law, glucose debit/aggregation, coarse-model replacement | Food-to-blood-to-cell-to-body causal experiment, sensitivity intervention, no duplicate uptake, zoom/refinement/replay invariance, human endpoint tests |
| P5 neural excitation | Reviewed sensory/afferent/spinal/motor route, conduction, NMJ ACh release/cleft clearance/receptors | Sourced route graph, timing comparison, receptor/release/clearance perturbations, absence-of-connection negative control |
| P5 muscle mechanics | Load/length/velocity/force model, calcium regulation linked to mechanics, titin, energy accounting, proprioception | Published-model reproduction, fixed/isotonic/load tests, force-length/force-velocity data, work/ATP/heat accounting, body coupling |
| P5 molecular visuals | Actual protein/filament structures and regulatory/head poses; molecular mechanism-to-geometry mapping | Provenance and units, valid molecular geometry, state-driven conformational tests, anatomical/molecular review, runtime visibility |
| P6 brain | Reference-space registration; anatomical/connectivity/functional/supply maps; selected circuit; regional perfusion/glia/BBB/CSF | Source/species/donor mapping, connection review, neural timing, demand-supply tests and no double counting |
| P7 endocrine/organ feedback | RAAS/aldosterone, ADH physical pathways, glucagon/counterregulation, catecholamine receptors; HPA/thyroid/GH/calcium modules | Explicit species, secretion/transport/receptors, delays, balance and source-specific ablation; human validation where applicable |
| P8 functional organ units | Liver lobule/bile, nephron, alveolar-capillary unit, villus/crypt/lymph, islet, cardiac conduction/myocytes, skin | Each unit's sourced dynamics + geometry, unit tests/data, conserved aggregation into body; separate receipts per organ |
| P8 blood details | RBC gas mechanisms, selected coagulation/platelet/immune processes | Declared scope, physical/chemical accounting, source experiments and coupling tests |
| P9 integrated system | Meal/exercise/recovery, fluid loss/replacement, sensory/autonomic scenarios, ensembles and uncertainty | Held-out integrated responses, long-run stability, deterministic replay, cross-organ sensitivity, runtime budgets |
| P10 molecular/individual refinement | Selected detailed/stochastic/reaction-diffusion mechanisms and identifiable individual parameters | Predictive gain on held-out data, molecular/charge/energy consistency, identifiability, model reduction agreement and compute cost |
| Deployment | Confirm local target is actually published when requested | Exact deployment/domain/build revision, browser smoke, asset fetch/hash/CORS behavior and runtime error checks |

No complete brain connectome, all-human-cell census, atomic body trajectory, whole-body biochemical energy ledger, or universal disease predictor exists here. Adding names, glowing particles or more meshes does not close those gaps.

## 10. Recommended next-agent sequence

1. Read this handoff, inspect `git status`, and verify the current commit. Preserve unrelated changes and the historical worktree. Recheck live processes rather than trusting a stale PID.
2. Read the source-model package and current validation receipts before modifying excitation. Reuse the generator and source arrays; do not rewrite the 56 equations manually.
3. Reconcile stale documentation/tracker statuses against the code. The README and roadmap still lag P3 and the P5 groundwork. Do not mark whole phases complete merely to align labels.
4. Choose the next evidence-backed mechanism with the full goal in view. The major integration gap is **P4's meal-to-muscle glucose uptake and body feedback**. The newest visual-mechanism branch needs **load-dependent muscle mechanics/NMJ/energy coupling**. These are complementary remaining tracks; do not silently substitute more isolated demos for body integration.
5. Before fitting or coupling, select the exact source model/dataset, units, state ownership and observation mapping. Preserve species and uncertainty. Lock quantitative checks before examining fit results.
6. Implement one owned connection at a time; debit/credit actual quantities once. Treat renderers as observers of committed state. Do not drive shortening by an arbitrary normalized calcium/brightness curve.
7. Verify at the appropriate layer: source reproduction → conservation/units/negative controls → independent data → integrated perturbations → Blender/GLB identity/geometry → actual browser/visual/performance review.
8. Rerun the full relevant regression on the new revision and record exact commands, source hashes, solver/environment versions, dates, failed endpoints and output paths. Reconcile the newest report with the scope it actually covers.
9. Save a local handoff/commit when requested; do not push/deploy or use paid providers without authorization. Leave the full active goal incomplete until evidence supports every requested requirement.

## 11. Known documentation drift and cautions

- `README.md` still describes three tissue scales and says P3–P10 pending; current code includes sarcomere, a P3 pilot and P5 source groundwork.
- `docs/MULTISCALE_EXECUTION_PLAN.md` and `docs/multiscale-roadmap.json` are architecture/phase authorities, but some status strings and “planned/not present” locations are stale.
- `docs/SARCOMERE_INCREMENT.md` accurately records the manual sliding increment; its statements that calcium/cross-bridge state is wholly absent predate the new optional Shorten overlay. Its mechanical-load, force, human-data and full-body limitations remain true.
- The asset entity description saying heads have “no ATP or cross-bridge kinetics” describes the static mesh, while the new overlay has source-level population kinetics. The mesh still has no individually animated head kinetics. Clarify wording before presenting it as an integrated molecular reconstruction.
- Early P1/P2 browser receipts belong to earlier builds. A passing old report must not be relabeled as a fresh full-suite check.
- Source reproduction is not independent biological validation. The mouse model and mixed-preparation insulin model must remain labeled accordingly.
- The full objective is incomplete. No goal-complete or goal-blocked call is justified by this handoff.

## 12. Luna inspection and final handoff audit

Three `gpt-5.6-luna` agents performed bounded, read-only inspections for this handoff: `inspect_physiology` reviewed legacy/P1/P3 mechanisms and evidence; `inspect_assets` reviewed Blender/anatomy/licenses/environment; `inspect_excitation` reviewed source translation, solver, recording, UI and test gaps. The primary agent reconciled their findings and independently recomputed the receipt hash comparisons below. Agents did not implement changes or rerun the application test suites. Their inspection is not a new passing test run.

### Receipt-to-current-source audit on 2026-09-18

| Receipt | Hash entries checked | Current result |
|---|---:|---|
| P1 numerical `validation/p1/verification.json` | 16 | All match |
| P2 assets `validation/p2/asset-verification.json` | 10 | All match |
| P3 numerical `validation/p3/verification.json` | 9 | All match |
| P5 numerical `validation/p5/excitation-verification.json` | 7 | All match |
| Historical P1 browser receipt | 16 | Four differ |
| Historical P2 browser receipt | 25 | Eight differ |

P1 browser differences: `app/globals.css`, `app/simulation/Simulator.tsx`, `app/simulation/simulation.css`, `web/main.tsx`.

P2 browser differences: `app/tissue/TissueExplorer.tsx`, `app/tissue/TissueScene.tsx`, `app/tissue/assets.ts`, `app/tissue/recording.ts`, `app/tissue/tissue.css`, `app/simulation/Simulator.tsx`, `web/main.tsx`, `public/models/multiscale/muscle-pilot/manifest.json`.

These differences are expected after later development; they invalidate treating those older browser receipts as proof of the current UI, not the historical pass itself. A hash match establishes unchanged covered bytes, not coverage of files omitted from a receipt. The latest P5 report was separately parsed: 16 expected passes, zero skipped/unexpected/flaky. Its scope is the four named specs in section 6, not a full regression.

The excitation inspector also verified archived model manifest hashes, the generated C source hash, and all five source hashes plus image hashes in `outputs/verification/p5/capture.json`. That capture receipt does not hash every UI file (for example, `TissueExplorer.tsx`); retain this coverage limitation. The current tissue TAP/asset receipt records all five tests passing, superseding an older memory note about a failed filament endpoint tolerance assertion. The older error was approximately `9.8e-11 m`; do not carry it forward as an unresolved current failure.

### Additional outstanding test gaps

- Generator integrity: verification checks recorded source hashes but does not automatically regenerate TypeScript and assert an empty diff. Add a deterministic generate-and-compare check before changing source/generator contracts.
- Reference provenance: the checked-in excitation reference internally records its Python model hash, but not its reference-script/protocol hashes. The verification receipt hashes the current reference script externally; this does not prove that the checked-in output was produced by that script version. Add generation-time script/protocol hashes and enforce them during verification.
- Excitation UI: numerical train coverage exists, and train screenshots were captured, but automated tests do not establish train/partial-release visual semantics, fiber-tint semantics, or golden-image correctness. Image inequality only proves changed pixels.
- Fresh full regression: run `npm run check`, all numerical suites, `npm run verify:excitation`, anatomy validators and **unfiltered** `npm run test:browser:production` on the next implementation revision. Preserve a new report separately instead of relabeling this 16-test report as full coverage.
- Human endpoint work: `validation/p1/human-endpoint-review.json` records why AS160 and image-colocalization are unsuitable direct outputs. Its candidate human surface-GLUT4 dataset still needs donor-level data, an observation mapping, uncertainty and predeclared acceptance bounds.
- Model coupling, neuronal/NMJ causality, realistic force/energy mechanics, full fatigue, physical-device GPU performance and all human-validation gates in section 9 remain untested/unimplemented as specified there.

### Environment and repository at inspection

- Implementation baseline: clean `simulate` at `171afdf`; the handoff adds only `HANDOFF.md` and this document. No implementation, asset, reference or test receipt was altered for the handoff.
- The detached historical worktree was also clean and remains preserved. Local `origin/simulate` pointed to the implementation commit when inspected; this does not independently verify remote deployment or establish who pushed it.
- No Human Atlas server was listening on port 3016 at inspection. A browser tab with that URL can be stale; start the server before captures. No implementation test job is left pending by this handoff.
- Inspected local tools: Node 22.22.0, npm 11.10.1, Blender 4.4.3, installed Playwright dependencies and `ffmpeg`; `game-dev` unavailable. Recheck after environment changes.
- Licenses: BodyParts3D 4.0 is CC BY 4.0; additive 4.3 and older lung sources are documented as CC BY-SA 2.1 Japan; original generated microgeometry/texture is MIT; Shorten is CC BY 3.0. Preserve the separate insulin source notice too.

Handoff-document checks: both Markdown files passed local-link and code-fence validation, all 60 literal file/directory references checked existed, and the staged documentation diff passed `git diff --cached --check`. These are documentation checks, not new simulation tests.

The excitation Luna agent reviewed the completed handoff against its audit and found it materially accurate. Its two recommendations—stronger reference-generation provenance and preserving the tracked browser report during reruns—are included above.

Final delivery is a documentation-only save. The continuation remains: refresh the complete regression, reconcile roadmap evidence, then implement and validate the next owned physiological connection without claiming full-body completion.
