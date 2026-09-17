# Human Atlas physiology model

Status: an implemented, exploratory organ-and-hormone model. **The requested complete-body simulator is not finished.** Numerical tests are not biological validation. This document records the current implementation and the remaining scope without redefining completion around the first version.

## Implemented data flow

```
Scheduled / immediate input → one-second fixed simulation step
  → stomach transit → saturating digestive fluxes → portal blood / intestinal lymph
  → arterial, organ blood, tissue, portal, venous and pulmonary transport
  → hormone secretion, clearance, and feedback
  → hepatic fuel release / storage + local oxygen- and fuel-limited oxidation
  → cardiac output, perfusion allocation, ventilation, gas exchange
  → renal excretion, water redistribution, heat, and fatigue
  → timestamped state + 30-second trace samples + event receipts
  → organ inspector / brain resistance network / comparison / export
```

The model runs in a Web Worker. Playback speed changes simulated seconds per wall-clock interval; it does not change the one-second integration step. Pausing preserves state. Manual advances pause playback. Timed events apply at exact integer seconds, ordered by their identifiers when timestamps tie. Presets start a new run at time zero.

A comparison forks the current body, retains its current environment, and removes future queued interventions. Subsequent inputs affect only the primary run. It is a counterfactual from the fork time, not a population reference or automatic clinical control.

Run JSON contains the complete current state, current comparison state, future queue, event receipts, model version, and retained traces, current one-second fluxes, and cumulative amounts for each transfer route. Import validates shapes, numerical finiteness, timestamps, input limits, organ membership, and substrate accounting before replacing the active run. Import pauses the model. There is no automatic persistence yet: export before closing the page.

## Units and equations

- Model time: seconds; internal rate calculations: minutes.
- Blood flow: L/min; pressure: mmHg; volume: mL.
- Nutrient pools: grams of lumped substrate. Arterial glucose concentration is `100000 × arterial_glucose_g / arterial_plasma_mL` in mg/dL. Every organ blood and tissue compartment has its own concentration. Whole-body nutrient totals are derived sums, used for accounting rather than instantaneous mixing.
- Oxygen consumption and delivery: mL/min; inspired fractions are dimensionless. Respiratory calculations assume sea-level barometric pressure.
- Hormone and enzyme variables: **dimensionless activity relative to an illustrative baseline**. They are not serum laboratory concentrations.
- Hormone update: `H_next = target + (H_previous - target) × exp(-dt / tau)`. Displayed secretion is `target/tau`; clearance is `H/tau`. Each target depends on upstream state. Time constants and gains are hand-selected parameters requiring calibration.
- Enzyme-limited absorption: `rate = Vmax × activity × substrate / (Km + substrate)`, bounded by substrate available during the step. Gastric transit is exponential; CCK / GLP-1 slow it and vagal drive accelerates it.
- Cardiac output: `heartRate × strokeVolume / 1000`. Mean pressure relaxes toward `5 + cardiacOutput × systemicResistance`. Nine systemic allocation weights sum exactly to the cardiac output; pulmonary flow equals that output. Hepatic total inflow is hepatic arterial flow plus portal flow from the gut branch. The displayed liver branch alone denotes hepatic arterial flow.
- Approximate alveolar gas relation: `PAO2 = FiO2 × 713 - PaCO2 / 0.8`. A Hill saturation curve maps arterial oxygen pressure to saturation. Oxygen capacity uses a fixed hemoglobin assumption of 15 g/dL. Oxygen and carbon dioxide inventories travel with whole-blood flow. The lung exchanges gases with an ambient boundary; oxygen delivery uses arterial inventory. Organ oxidation consumes only local oxygen and available nutrient substrate. Arterial saturation / partial pressure and organ venous content are derived from actual transported inventory.
- Brain flow: solve `Σ G_ij(P_i - P_j) = 0` at interior nodes with systemic arterial and central venous pressure boundaries. A common resistance scale makes total brain flow equal the body's allocated cerebral flow. This **does not constitute independent autoregulation**. Sensory inputs change relative tissue-bed conductance.

Water and substrate changes are conservative transfers, bounded before removing material. The carbohydrate ledger explicitly credits amino-acid-derived glucose; the protein ledger records the consumed precursor. These are substrate ledgers, **not a complete elemental carbon / nitrogen balance**.

Water accounting includes stomach water, gut water, plasma, interstitium, intracellular water, cumulative urine, insensible loss, ingested water, and metabolic water. The bladder is a subset of cumulative urine and is not double-counted. Voiding empties the bladder without erasing cumulative renal excretion.

## State coverage

| Requested mechanism | Current implementation | What is still needed |
| --- | --- | --- |
| Blood flow through the entire body | Heart rate / stroke volume, pulmonary circuit, nine systemic branches, portal route, pressure and per-organ flow | Pulsatile multi-compartment circulation; volume / compliance and resistance network; full geometry-to-topology binding; lymphatic circuit |
| Organs process blood and fluids | 23 distinct blood / tissue / lymph-transit pools, portal nutrient routing, liver glycogen and glucose synthesis, local oxygen-limited oxidation, renal water / sodium and glucose clearance | Acid-base and electrolyte transport, detailed renal / hepatic chemistry, full lymph and CSF conservation; individual organ reaction coverage beyond the initial five substances |
| Enzymes react | Amylase, pepsin, protease, lipase activity and saturating absorption; renin / angiotensin activity loop | Substrate / product reaction registry, secretion and clearance with units, pH and bile dependence, metabolic enzyme pathways and evidence-based kinetics |
| Detailed brain connected to blood vessels | 34-node / 55-path arterial, tissue-bed, and venous schematic; Circle of Willis; named atlas mesh links; zoom and pan | Every source cerebral vessel accounted for; curated and verified branch connectivity; geometry registration; independent local autoregulation, realistic venous / CSF coupling and regional neural demand |
| Food eaten | Carbohydrate, protein, fat, water, sodium; transit and uptake over time | Food composition / bolus characterization, fiber and fecal losses, gastric acid / secretions, realistic multi-meal and fasting metabolism |
| Air breathed | Inspired O₂ / CO₂, ventilation, transported blood-gas inventories with balance ledgers, local oxygen limitation, arterial saturation feedback | Alveolar gas storage, altitude / lung mechanics, anaerobic pathways, acid-base coupling |
| Sensory inputs | Light, sound, touch, pain, food aroma, sleep opportunity, exercise, ambient temperature | Modality-specific sensory paths and autonomic controllers; perception remains outside this noncellular abstraction |
| Whole-body hormones | 31 relative activity states in pancreatic, stress, renal / volume, digestive, thyroid, growth, circadian, male reproductive and calcium loops | Physiological concentration units; endocrine transport; complete target effects; reference phenotypes, pulsatility, sex / age variation; calibration against independent data |
| Track everything that happens in the model | Complete input / threshold receipts; per-route cumulative fluxes; latest one-second transfers; current state export; latest 24 h of 30 s organ / systemic traces; comparison and deterministic resume | Full time histories of individual fluxes and structured action replay; durable experiment storage; expanded reaction and hormonal transport boundaries |
| Iterate until perfected | Unit, integration, browser, anatomy data and production build checks | Quantitative biological validation, sensitivity / uncertainty analysis, independent cross-model comparison, coverage audit with external evidence |

## Brain source coverage audit

`npm run audit:brain` regenerates [the complete source-candidate inventory](brain-vessel-coverage.json). In the packaged atlas, the defined spatial / naming rule yields **178 vascular candidates** in the current reference assembly: 83 exact name associations to schematic nodes, 62 grouped territory associations, 31 unresolved, and 2 adjacent orbital vessels. Every candidate has a unique source ID, classification, association basis, and laterality evidence. The 3D viewer can display this entire candidate set together. Coverage filters and individual source links are available below the brain map.

Ten unresolved candidates from the 4.0 base include paired anterior inferior cerebellar, anterior spinal, central-sulcus, and posterior temporal branch meshes. Several unsided names do not establish laterality through concept membership. The audit preserves that uncertainty; it does not infer verified vascular edges from a mesh bounding box. The added 4.3 package supplies 27 cranial venous meshes: four exact-name associations, two grouped deep venous associations, and 21 unresolved drainage associations. Venous meshes are explicitly classified before arterial territory matching, so a cerebral vein cannot become an ACA association by name overlap. These are concrete remaining source-data / topology gaps, not a claim of full vessel connectivity.

## Transport implementation (model 0.2)

Thirteen whole-blood compartments total 5,000 mL at reference volume: arterial (700), mixed venous (2,050), pulmonary (450), portal (150), and nine organ blood beds (1,650 combined). Nine corresponding interstitial pools total 11,000 mL. A separate intestinal lymph pool represents lipid transit, without a complete lymph fluid circuit. Blood-solute distribution is 60% of whole-blood volume; gases use the whole-blood volume. Plasma and interstitial water changes rescale distribution volumes while preserving substance amounts.

Transported species are glucose, amino-acid substrate, lipid substrate, O₂ and CO₂. The solver calculates advective transfers simultaneously from old concentrations, subdividing a one-second step to keep total outgoing volume fractions below 0.25. Tissue exchange uses the exact relaxation solution for a pair of finite, permeable pools. It records every source / destination / species / mechanism and accumulates per-route totals. Routing and permeability parameters are illustrative; geometry is not used to derive conductance.

The intestine introduces carbohydrate and amino-acid products to the portal pool. Lipid absorption enters intestinal lymph and reaches venous blood with an exponential transit time. Hepatic glycogen release and glucose synthesis supply liver interstitium. Storage and oxidation remove actual local material. In the present coarse chemistry, glucose oxidation requires 746 mL O₂ per gram and lipid oxidation 2,010 mL O₂ per gram; lipid respiratory quotient is 0.7. The brain bed uses glucose only. These are representative substrate conversion factors rather than a complete biochemical reaction network. Metabolic water production follows actual substrate oxidation.

Gas ledgers balance current blood inventory against initial inventory, signed net lung exchange, and tissue production / consumption. Quantities are standard-volume equivalents in mL, not gas mass in grams. A zero-oxygen test establishes that organ oxidation cannot consume unavailable oxygen; it does not establish clinical injury predictions. Pulmonary exchange uses an illustrative 0.3-second relaxation constant. CO₂ content / pressure conversion remains a linear approximation rather than a full acid-base model.

Transport tests establish conservative, nonnegative high-throughput flow, delayed portal-to-hepatic-to-systemic tracer transit, post-meal portal gradients, local oxygen limitation, and cumulative transfer receipts. No source validation results are inherited.

## Endocrine activities

The registry in `app/simulation/endocrine.ts` defines sources, targets, time constants, and descriptions:

- Fuel / satiety: insulin, glucagon, GLP-1, ghrelin, leptin.
- Autonomic / HPA: epinephrine, norepinephrine, CRH, ACTH, cortisol.
- Fluid / pressure: ADH, renin activity, angiotensin II, aldosterone, ANP.
- Digestion: gastrin, secretin, CCK.
- Thyroid / growth: TRH, TSH, combined thyroid activity, GH, IGF-1.
- Circadian / adult male reproductive: melatonin, GnRH activity, LH, FSH, testosterone, inhibin B.
- Calcium: PTH, calcitriol.

Renin is an enzyme represented in the endocrine signaling panel, not mislabeled as a steroid or peptide hormone. Combined T3 / T4 and GnRH activity do not resolve binding or pulse frequency. Growth and reproductive feedback are simplified axes, not tissue growth or gametogenesis. Some targets are descriptive context for future expansion rather than fully implemented biochemical effects; inspect the engine equations for current causal coverage.

## Evidence status

**Observed in local execution:** numerical conservation and expected directional responses in the scripted scenarios; exact scheduling and chunk-independent determinism; recordings resume identically; browser controls drive the worker and exported state; reference anatomy data validates with the pre-existing validators.

**Derived:** cerebral node pressures / flows, tissue venous oxygen, all simulated hormone activity and organ readouts.

**Not established:** quantitative agreement with a human dataset, clinical accuracy, completeness of pathways, every anatomical vessel connected, pathological predictions, or a full survival model. Oxygen / fuel shortage constrains local oxidative metabolism and accumulates unmet oxidative demand. Anaerobic compensation, ketone support, and injury are not yet modeled. Extreme or prolonged inputs therefore require additional model work.

The trace window is bounded to 2,881 samples (24 hours at 30-second spacing). Event receipts remain complete. The nominal seven-day advance limit is a software bound, not evidence of seven-day physiological validity. Sodium added with meals currently mixes immediately into the extracellular pool; gut sodium transit is unresolved. Water redistribution approximates fixed volume ratios and does not solve full osmotic compartment equilibration. Calcium and CSF values are proxies rather than closed mass balances.

## Verification commands

```sh
npm run check
npm run test:physiology
npm run test:browser
node scripts/validate-atlas.mjs
node scripts/validate-interactions.mjs
npm run build
```

Install Chromium for browser tests with `npx playwright install chromium`. The browser suite starts or reuses the local Vite server. Anatomy integration tests render the full 2.29-million-triangle source atlas; software-rendered headless WebGL can take substantially longer than the simulation workspace.

## Sources and boundary

Conceptual references, read 2026-09-08:

- [Kitware Pulse system methodology](https://pulse.kitware.com/_system_methodology.html): system boundaries, compartment architecture, and integration of transport / solvers.
- [Pulse gastrointestinal methodology](https://pulse.kitware.com/_gastrointestinal_methodology.html): a reference for connecting intake, absorption, and circulation.
- [Pulse substance transport methodology](https://pulse.kitware.com/_substance_transport_methodology.html): reference compartment / quantity / transport boundaries. This implementation uses explicit bounded advection and finite-pool exchange, not the Pulse linear solver.
- [Pulse renal methodology](https://pulse.kitware.com/_renal_methodology.html): renal / cardiovascular coupling as a future quantitative target.
- [Pulse endocrine methodology](https://pulse.kitware.com/_endocrine_methodology.html): comparison of limited endocrine modeling scope. Its documented endocrine equations are **not** the equations used here.
- [Cipolla, The Cerebral Circulation, Anatomy and Ultrastructure](https://www.ncbi.nlm.nih.gov/books/NBK53086/): paired carotid / vertebral inflow, Circle of Willis, branching and collaterals. The schematic drawing is original, not a copied anatomical plate.
- [BodyParts3D source attribution](../public/ATTRIBUTION.md): mesh names / geometry and their license. Name matches do not establish actual vascular continuity.

No Pulse implementation or validation suite is embedded. Its validation status does not transfer to this model.

## Next implementation order

The items below describe the organ-scale backlog. The [multiscale execution plan](MULTISCALE_EXECUTION_PLAN.md) now governs phase order and adds Blender assets, functional nerves/brain circuits, cellular mechanisms and validation gates. Its P0 inventory/planning is complete. [P1 is in progress](P1_IMPLEMENTATION.md): the new physical reaction kernel and molecular lab run isolated local experiments. They do not yet change the organ-scale equations or convert relative hormone activities to physical concentrations. [P2 is in progress](P2_IMPLEMENTATION.md): Blender-authored muscle, fascicle and fiber specimens support 3D inspection and observe the archived insulin trajectory. Their illustrative overlay does not add glucose uptake to the organ-scale model. P3–P10 remain pending.

1. Expand the implemented transport network to electrolyte, urea, acid-base, and endocrine species. Add explicit elemental accounting and anaerobic / ketone support; retain the now-implemented arterial / venous / portal pools, local oxygen limits, and flux provenance.
2. Audit all cerebral vascular meshes and attach provenance-bearing, reviewable topology. Distinguish known edges, grouped terminal beds, and unresolved source elements. Couple brain autoregulation back into systemic resistance / flow.
3. Introduce a reaction and endocrine parameter registry with physiological units, transport, and secretion / clearance calibration; extend digestive / renal / hepatic chemistry and target effects.
4. Calibrate and compare against independent baseline, meal, exercise, fluid, sensory, and circadian observations, including uncertainty and failure domains. Complete the full requirement audit before claiming the requested end state.

## Physical display and motion

The Whole body view now uses the assembled source anatomy with rate-driven heart, lung, diaphragm and digestive motion, plus blood, air and intake tracers. These display mechanics do not change the solver. Wall-clock visual cycles preview the current heart and respiratory rates even while simulated time is paused; accelerated simulation does not accelerate them. Tracer transit, deformation and particle size are illustrative. [Physical anatomy coverage](PHYSICAL_ANATOMY.md) records exact source additions, cross-version lung limitations, and the boundary between display and physiology.
