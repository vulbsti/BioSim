# Biological Simulation: from Human Atlas to Whole-Body Molecular Simulation

**Date:** 2026-09-08
**Audience:** Engineers joining the project, reviewers
**Companion to:** `docs/PHYSIOLOGY_MODEL.md` (authoritative on the implemented model),
`app/simulation/engine.ts`, `app/simulation/transport.ts`, `app/simulation/endocrine.ts`,
`app/simulation/brain.ts`, `app/simulation/types.ts`, `tests/physiology.test.ts`

## 1. What this document is

This is the mental model for the branch's direction shift: from an interactive
anatomy explorer toward a long-term biological simulation of the human body down
to the molecular level, where every interaction is mapped and conservable.

It is not a tutorial, not an API reference, and not a claim that the current
model is that simulator. Where details conflict, `docs/PHYSIOLOGY_MODEL.md`,
the engine source, and the tests are authoritative. This doc explains *why* the
current shape exists and *what must change* to earn the molecular end state.

## 2. The starting situation

Two states of the world are being connected.

**State A — the atlas (main branch).** An interactive 3D explorer built on
BodyParts3D 4.0, an adult male reference anatomy under CC BY 4.0. The viewer
renders every source mesh (README: **2,234 individually selectable meshes**,
**15 systems**, **3,432 named concepts**; packaged geometry
**2,288,268 triangles**, ~**33 MB** compressed). Geometry is merged into batches
with per-structure GPU textures for translation/visibility/selection
(`app/scene.tsx`, `app/anatomy.ts`); exploded layouts pack visible pieces
(`app/explosion-layout.ts`); validators cover buffers, names, layouts, and
tap-vs-drag (`scripts/validate-atlas.mjs`, `scripts/validate-interactions.mjs`).
Recent provenance work adds thyroid/parathyroid expansion meshes
(`docs/anatomy-expansion-provenance.json`), five lung lobe overlay surfaces
(`docs/lung-surface-provenance.json`), and a brain-vessel candidate audit
(`docs/brain-vessel-coverage.json`). The atlas answers *where things are*.
It says nothing about *what they do over time*.

**State B — the physiology lab (`simulate` branch, "version 1").** An
exploratory organ-and-hormone model (`MODEL_VERSION='atlas-physiology-0.2.0'`,
`BodyState.version: 2`) that runs in a Web Worker at fixed one-second steps
(`app/simulation/simulation.worker.ts`, `app/simulation/use-simulation.ts`).
Its implemented data flow is intake → digestion → portal/lymph routing →
23-compartment transport → hormone feedback → hepatic fuel handling + local
oxygen-limited oxidation → cardiac/ventilation/gas exchange → renal/water/heat
(`docs/PHYSIOLOGY_MODEL.md`, `app/simulation/engine.ts`). Concretely:

- Transport (`app/simulation/transport.ts`): 13 whole-blood pools totaling
  5,000 mL (arterial 700, venous 2,050, pulmonary 450, portal 150, nine organ
  beds 1,650) plus nine interstitial pools (11,000 mL) and one intestinal lymph
  lipid-transit pool. Five species: glucose, amino-acid substrate, lipid
  substrate, O₂, CO₂ (`SUBSTANCES` in `app/simulation/types.ts`). Bounded
  advection with substepping (outgoing fraction ≤ 0.25, max 128 substeps) plus
  exact two-pool capillary exchange; every move is receipted by
  source/destination/species/mechanism (`logFlux`, `transfer`).
- Endocrine (`app/simulation/endocrine.ts`): **31 relative activity states**
  across fuel/satiety, HPA/autonomic, fluid/pressure, digestive, thyroid/growth,
  circadian/male-reproductive, and calcium loops. Update rule
  `H_next = target + (H_prev − target) × exp(−dt/τ)`; displayed secretion
  `target/τ`, clearance `H/τ`. All dimensionless multiples of an illustrative
  baseline — not serum concentrations.
- Brain (`app/simulation/brain.ts`): **34-node / 55-path** arterial, tissue-bed,
  and venous schematic with Circle of Willis, solved as a steady resistive
  network (`solveBrain`, Kirchhoff conservation at interior nodes, one common
  resistance scale pinning total flow to the body's cerebral allocation).
  `auditBrainVessels` now yields **178 vascular candidates** in the expanded
  assembly (83 exact-name, 62 grouped-territory, 31 unresolved, 2 adjacent
  orbital). The 27 added cranial venous meshes improve geometry coverage;
  their individual drainage topology remains unresolved except for coarse
  label and collector associations.
- State, inputs, history (`app/simulation/types.ts`, `engine.ts`,
  `recording.ts`, `scenarios.ts`): `BodyState` carries stomach/gut pools,
  glycogen/fat/protein stores, plasma/interstitium/intracellular water, sodium
  proxy, bladder/cumulative urine, vitals, `flows`, integer-scheduled `queue`,
  `receipts`, 30-second `history` samples (2,881 cap = 24 h), and forked
  `reference` comparison. Seven presets (resting, meal, exercise, startle,
  air, water, sleep) plus custom meals and ten environment/sensory inputs.
  Export/import validates shape, finiteness, timestamps, input bounds, organ
  membership, and substrate accounting before replacing a run.
- Tests (`tests/physiology.test.ts`): conservation residuals
  (`waterResidual`, `carbohydrateResidual`, `proteinResidual`, `fatResidual`,
  `gasResiduals`), directional scenario responses, deterministic scheduling,
  brain-network conservation, portal-tracer ordering, zero-oxygen limitation,
  high-throughput nonnegativity, recording round-trip determinism.

The team's stated constraint, quoted from the model doc: *"Numerical tests are
not biological validation"* and *"The requested complete-body simulator is not
finished."* The deepest structural difference is this: the atlas is a
**spatial inventory with provenance**, while the simulator is a **temporal
accounting system with receipts** — and the two are only loosely joined
today (name matches, bounding-box candidate rules, per-organ UI links).

## 3. What success looks like

The long-term end state — a whole-body simulation down to the molecular
essence, with every interaction mapped — is held to five invariants.
Every decision below honors them.

1. **Conservation first.** Matter and volume are neither created nor destroyed
   inside the system boundary. Every transfer, reaction, secretion, clearance,
   and boundary exchange is a bounded, receipted ledger entry, exactly as
   `transfer`/`logFlux` do today — extended to elements, charge, and molecules.
2. **Every interaction is addressable.** Any claim "X became Y in compartment C
   via mechanism M" names a registered reaction or transport edge with units,
   stoichiometry, parameters, and provenance. No anonymous source/sink except
   an explicitly recorded system boundary (air, food, urine, heat).
3. **Scale-continuous.** Body → organ → tissue → cell → molecule is one
   connected accounting graph, not five separate models. Coarse pools must
   decompose into finer pools without breaking the ledgers in goal 1.
4. **Provenance-bearing.** Anatomy meshes, vessel edges, reaction parameters,
   and validation observations each carry source, transform, and uncertainty —
   the way `docs/*-provenance.json` and `auditBrainVessels` do for geometry
   today, extended to kinetics and connectivity.
5. **Falsifiable.** Each mechanism ships with the observation that would
   disprove it: baseline ranges, meal/exercise/fluid/sensory/circadian
   responses, and stated failure domains. Exploratory proxies are labeled as
   proxies until calibrated against independent data.

## 4. The design tensions

| # | Pull toward A | Pull toward B |
|---|---|---|
| T1 | Anatomical completeness: every mesh, vessel, cell type represented | Simulatable abstraction: lumped pools that actually integrate in a browser |
| T2 | Molecular fidelity: full stoichiometry, pH/thermal dependence, kinetics with units | Coarse conservation: grams of lumped substrate that balance today |
| T3 | Clinical realism: concentrations, pressures, and rates matching human data | Relative proxies: dimensionless hormone activity, illustrative time constants |
| T4 | Exact topology: verified vessel/reaction edges with geometric registration | Schematic connectivity: resistive beds and grouped territories that solve |
| T5 | Full history: every flux at every step, replayable | Bounded traces: 30 s samples, 24 h window, per-route cumulative receipts |
| T6 | Deterministic fixed-step solver in a Web Worker | Multiscale kinetics (ms channel gating → hourly transcription) |
| T7 | Exploratory speed: hand-set gains that produce plausible directions | Calibration rigor: uncertainty, sensitivity, and independent cross-model comparison |

## 5. The central insight

> Conservation accounting is the skeleton that molecular detail hangs on —
> once every gram and milliliter is receipted, finer chemistry can replace
> lumped proxies without rewriting the simulator.

That is why the engine's least glamorous code — residual functions, bounded
`transfer`, flux ledgers, recording validators — is the most load-bearing for
the molecular goal. It makes "add a molecule" a ledger extension instead of a
redesign.

## 6. The decisions, in causal order

### 6.1 Keep the BodyParts3D mesh inventory as the spatial anchor

**Alternative considered:** Build a new synthetic body mesh or switch atlases
for simulation convenience.

**Why keep it:** Goals 3 and 4 need a stable, licensed, fully inventoried
spatial reference. The 2,234-mesh / 3,432-concept inventory with per-mesh
bounds, systems, and provenance files already gives every future compartment a
candidate geometric home (`app/anatomy.ts`, `public/models/*.json`). Throwing
that away would trade a solved data problem for an unsolved one.

**Trade-off accepted:** Adult-male-only reference; no sex/age variation and no
cellular or subcellular geometry yet.

### 6.2 Conserve coarse substrates before introducing any real chemistry

**Alternative considered:** Start with a molecular reaction network (glycolysis,
TCA, urea cycle) in one organ.

**Why coarse-first:** Goal 1 is the precondition for goal 2. The engine's
water/carbohydrate/protein/fat/gas residuals (`engine.ts`) and gas ledgers
(`gasResiduals`) prove the solver cannot create matter at high throughput,
under reordered scheduling, or across export/import. A kinetic network laid
over a leaky solver would produce impressive-looking but uncheckable numbers.

**Trade-off accepted:** Representative conversion factors (746 mL O₂/g glucose,
2,010 mL O₂/g lipid, RQ 0.7) stand in for biochemistry; anaerobic, ketone, and
acid-base paths are absent by design.

### 6.3 Transport solutes and gases as explicit advective + exchange fluxes with receipts

**Alternative considered:** Implicit mixing — one systemic concentration per
substance, or an off-the-shelf linear solver.

**Why explicit receipts:** Goal 2 requires "portal tracer reaches hepatic blood
before the systemic artery" to be *observable*, not asserted. Simultaneous
old-concentration advection, exact two-pool exchange, and per-route cumulative
fluxes (`transportSubstances`, `TransportPanel`) make ordering, gradients, and
mass balance testable (`tests/physiology.test.ts`: tracer, gradient, receipts).
This pattern ports directly to future species (electrolytes, urea, hormones).

**Trade-off accepted:** Illustrative permeabilities; geometry never derives
conductance; lymph is a single lipid-transit pool, not a fluid circuit.

### 6.4 Model hormones as relative activities with first-order relaxation

**Alternative considered:** Full endocrine transport with molar concentrations,
binding, pulsatility, and sex/age axes from day one.

**Why relative-first:** 31 loops had to close (insulin/glucagon, HPA,
RAAS/ADH/ANP, digestive, thyroid, GH/IGF-1, GnRH/LH/FSH/testosterone/inhibin,
PTH/calcitriol) before any single loop could be calibrated. The
target/τ/relaxation registry (`hormoneInfo`, `updateHormones`) wires every
source→target→feedback path with 1–2 parameters each, so the UI can show
secretion vs. clearance and reviewers can see which targets are descriptive
vs. causal. Units would have faked precision at this stage.

**Trade-off accepted:** No clinical comparability; combined T3/T4, GnRH
activity, and growth/reproductive axes are simplified; some targets are
descriptive context only.

### 6.5 Draw the brain as a solvable schematic, and audit geometry separately

**Alternative considered:** Either render vessels without flows, or claim full
cerebral connectivity from name matches.

**Why schematic-plus-audit:** Goals 4 and 5 forbid inferring edges from
bounding boxes. The 34/55 resistive network gives pressures/flows that
conserve at every interior node and equal the body's cerebral allocation
(`solveBrain` residual/scale checks), while `auditBrainVessels` preserves the
remaining gap: 83 exact-name links, 62 grouped territories, 31 unresolved, 2
adjacent, including 27 cranial venous meshes in the expanded assembly. Label association and vascular continuity are
different claims and are stored as such.

**Trade-off accepted:** No autoregulation, no regional neural demand, no venous
or CSF coupling; several unsided names cannot establish laterality.

### 6.6 Receipt every intervention; bound the continuous traces

**Alternative considered:** Full time histories of every flux, or no history at
all beyond current state.

**Why receipts-plus-window:** Goal 2 plus browser reality (T5). Complete
input/threshold receipts and per-route cumulative totals answer "what happened"
exactly; 30-second organ/systemic samples over a 24-hour window answer "how did
it evolve" affordably. Deterministic integer scheduling (ties ordered by id)
and recording validators make export → import → resume bit-identical, which is
the prerequisite for any future full-replay feature.

**Trade-off accepted:** Individual flux time series and structured action replay
do not exist yet; the 7-day advance bound is a software limit, not a validity
claim.

### 6.7 Run fixed one-second steps in a Web Worker with speed as presentation

**Alternative considered:** Adaptive or sub-second stepping exposed to the UI,
or solving on the main thread.

**Why fixed-step worker:** Determinism and responsiveness. Playback speed
changes simulated-seconds-per-tick, never the integration step; pause preserves
state; manual advances pause playback (`simulation.worker.ts`,
`use-simulation.ts`). Chunk-independent determinism is tested, so future
multiscale sub-stepping (fast kinetics inside the 1 s envelope) won't disturb
reproducibility.

**Trade-off accepted:** Stiff fast dynamics (channel gating, rapid binding)
cannot be resolved at 1 s today; they must wait for sub-stepped reaction
modules.

### 6.8 Label the whole thing exploratory and publish the gaps

**Alternative considered:** Present directional responses as validation, or hide
proxy parameters behind clinical-looking units.

**Why explicit limits:** Goal 5. The Simulator footer ("Compartment dynamics ·
Schematic vessel network · No cellular simulation"), the model dialog, and
`PHYSIOLOGY_MODEL.md` §Evidence status separate *observed in local execution*
from *derived* from *not established*. That honesty is what lets the roadmap
below add molecules without retracting past claims.

**Trade-off accepted:** The public demo link predates local changes; no
clinical or predictive use is supported.

## 7. How cross-compatibility works

### 7.1 Anatomy ↔ simulation binding

Mechanism today: name/concept links (`brainAtlasMatches`), bounding-box
candidate rules (`auditBrainVessels`), and per-organ UI panels
(`organInfo[].anatomy`, `BodyMap`, `BrainCoverage`) that open matching
structures in the 3D viewer. What stays the same at molecular scale: meshes
remain the spatial index; compartments gain `meshIds` and `bounds` references.
What changes: grouped territories resolve into registered edges with
conductance derived from geometry, and venous/CSF/lymphatic circuits become
first-class edges rather than proxies.

### 7.2 Scale bridging (organ → cell → molecule)

Mechanism today: every organ owns a blood pool + tissue pool pair with a
shared exchange kernel, so adding a species is a column addition, not a
rewrite. What stays the same: the `Compartment`/`TransportFlux`/`MetabolicRate`
shape and the `transfer`/`logFlux` accounting law. What changes: tissue pools
decompose into interstitial + cytosol + organelle pools; `MetabolicRate`
entries become sums over registered reactions; lumped grams split into molar
species with elemental (C/H/O/N/P/S) and charge conservation alongside mass.

### 7.3 Run ↔ recording compatibility

Mechanism today: `MODEL_VERSION` gating, shape/finiteness/timestamp/ledger
validation in `recording.ts`, forked `reference` comparisons pinned to fork
time. What stays the same: versioned, self-validating recordings; deterministic
resume. What changes: schema migrations for new species/reactions must preserve
old recordings (default-fill + re-derive) or bump the version with a converter;
flux ledgers gain reaction-edge ids.

## 8. End-to-end data flow

### 8.1 Before (intervene)

Scheduled or immediate `Action` (meal, environment, void) is validated by
`validateAction` *before mutation*, timestamped to an integer second, ordered
by id on ties, and receipted (`receipt`, `schedule`, `applyAction`).

### 8.2 During (integrate)

Each fixed second: stomach transit → saturating digestive fluxes → portal
blood/intestinal lymph → simultaneous advection + finite-pool exchange →
hormone secretion/clearance/feedback → hepatic storage/release + local
O₂/fuel-limited oxidation → cardiac/perfusion/ventilation/gas exchange → renal
water/sodium/glucose clearance, redistribution, heat, fatigue. State +
30-second samples + cumulative receipts accumulate.

### 8.3 After (inspect, compare, resume)

Organ inspector, brain resistance network, hormone cards, transport ledger, and
traces render live state; forking clones the moment into a counterfactual
comparison; export serializes full state + queue + receipts + traces, and
import re-validates everything before replacing the run.

### 8.4 What's worth noticing

Ordering guarantees (tracer before systemic artery), nonnegativity under high
throughput, oxygen-limited (not oxygen-inventing) metabolism, and
chunk-independent determinism are the invariants. Everything molecular must
preserve them.

## 9. How the user stays in control

Opt-in vs. required: running the worker, forking a comparison, scheduling
inputs, and exporting are all explicit user acts; nothing persists
automatically (export before closing). Caller-owned: meal composition within
bounds, gas fractions at sea-level pressure, normalized workloads, sensory
intensities, scenario choice, playback speed. Narrowly constrained:
`INPUT_BOUNDS` rejects out-of-domain values before mutation; recording import
rejects shape/finiteness/ledger violations; circulating-volume excursions
outside the solver domain throw rather than silently integrate.

## 10. Maintaining the system without restricting future work

What the design enforces: bounded conservative `transfer`, receipted fluxes,
deterministic scheduling, versioned validated recordings, and provenance files
for every geometry drop. What requires team discipline:

1. No new species, hormone, or edge without a residual/ledger test and a
   documented failure domain.
2. No anatomy→topology inference from names or bounding boxes — only reviewed,
   provenance-bearing edges.
3. No clinical units on a proxy — relative activities stay relative until
   calibrated.

When in doubt, default to the boring ledger extension over the clever solver
rewrite.

## 11. Key insights

### 11.1 Receipts are the feature

Per-route cumulative fluxes and timestamped receipts turned "the model feels
right" into checkable claims (tracer ordering, gradients, conservation).
**Lesson:** log the transfer, not just the state.

### 11.2 Relative-first wiring beats premature units

Thirty-one closed feedback loops with illustrative gains taught more about
system behavior than one perfectly unit-ed loop in isolation would have.
**Lesson:** wire the graph coarsely, then calibrate edges.

### 11.3 Schematics must carry their own uncertainty

The brain network is useful *because* the audit counts exactly what is
unresolved (10) and what is missing (venous geometry). **Lesson:** ship the gap
count with the diagram.

### 11.4 Determinism is a validation strategy

Fixed steps, ordered ties, and validated resume make every scenario a
regression test. **Lesson:** reproducibility first, realism second — realism
compounds on reproducibility.

### 11.5 The UI is part of the model contract

Organ cards, hormone secretion/clearance readouts, transport inspectors, and
the model dialog expose which targets are causal vs. descriptive. **Lesson:**
if the interface can't show the mechanism, the mechanism isn't finished.

## 12. What this leaves open

The molecular end state — every interaction mapped down to the molecular
essence — is explicitly deferred, in this order (each phase preserves §3):

- **P1 — Close the organ-scale gaps.** Electrolytes, urea, acid-base, and
  endocrine-species transport; elemental C/N accounting; anaerobic/ketone
  support; full lymph + CSF conservation; pulsatile multi-compartment
  circulation with volume/compliance. (Extends `SUBSTANCES`, `transport.ts`,
  `engine.ts`; see `PHYSIOLOGY_MODEL.md` §Next implementation order.)
- **P2 — Register the vasculature.** Provenance-bearing cerebral (then
  systemic) topology: known edges vs. grouped beds vs. unresolved elements;
  geometry-derived conductance; autoregulation coupled back to systemic
  resistance. (Extends `brain.ts`, `brain-coverage.ts`, coverage JSON.)
- **P3 — Reaction registry with units.** Substrate/product stoichiometry,
  secretion/clearance in molar units, pH/bile/thermal dependence, enzyme
  kinetics with evidence links; digestive/renal/hepatic chemistry first, then
  organ-by-organ coverage. New `app/simulation/reactions.ts` + parameter
  provenance; `MetabolicRate` becomes a sum over registered reactions.
- **P4 — Cellular and molecular decomposition.** Tissue pools split into cell
  types → cytosol/organelle pools; channels, transporters, transcription/
  translation, and signaling cascades as registered reactions with fast
  sub-stepping inside the 1 s envelope; cell-count and surface-area scaling
  from histology sources.
- **P5 — Spatial-cell binding.** Mesh bounds → tissue volumes → cell
  populations → molecular pools, with the atlas as spatial index and every
  binding carrying uncertainty. No inferred edges; reviewable topology only.
- **P6 — Calibration and falsification.** Baseline/meal/exercise/fluid/
  sensory/circadian observations with uncertainty and sensitivity analysis,
  independent cross-model comparison (Pulse methodologies as quantitative
  targets, never inherited validation), and a coverage audit with external
  evidence before any completeness claim.

None of these are blockers to the current exploratory use. All of them are
blockers to calling the result a molecular human simulation.

## 13. How to read alongside the specs

- New to the project: this doc (§1–§5), then `docs/PHYSIOLOGY_MODEL.md`
  (equations, coverage table, evidence status), then `app/simulation/types.ts`
  → `transport.ts` → `endocrine.ts` → `engine.ts` → `brain.ts`.
- Reviewing a change: §6 for the decision it touches, §10 for the checklist,
  `tests/physiology.test.ts` for the invariant it must preserve.
- Planning molecular work: §12 in order; P1 before P3, P3 before P4 —
  kinetics without conservation is not on the roadmap.
- Implementation plan: there is no separate plan artifact yet; §12 is the
  sequencing source until one is written.
