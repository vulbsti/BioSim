# P3 increment: closed pulsatile hormone circulation

Implemented 2026-09-13. **P3 is in progress.** This is a synthetic engineering pilot with physical units. P1 human endpoint mapping and the full P2/P3 validation gates remain open.

## Working experiment

Open `http://localhost:3016/#circulation`, or choose **Trace hormone circulation** from the whole-body introduction. Start playback, select a compartment, and inspect its pressure, volume and plasma insulin. Switch to **Muscle fiber** without changing the numerical trajectory. Its GLUT4 display sites observe the local interstitial insulin input through the pinned source signaling equations.

The ten-compartment loop connects systemic veins → right pump → pulmonary arteries → pulmonary veins → left pump → systemic arteries → organ beds → systemic veins. The splanchnic branch drains through the portal vein and liver. The liver also has its own arterial supply. Parallel muscle, renal and remaining systemic beds complete the return.

A finite insulin input enters the portal or systemic venous compartment during seconds 5–25. Blood carries it using upwind concentrations and signed pressure-driven flows. It exchanges with a distinct muscle interstitial volume and clears through separately accounted hepatic, renal and local sinks. Changing hepatic clearance, tissue exchange or muscle vascular resistance recomputes the experiment. Save/load recomputes the exact model contract and restores the playhead paused. Controls lock during recomputation so a pending run cannot overwrite a newly edited playhead.

## Equations and ownership

- Blood pressure: `P = P_ref + (V − V_ref) / C`, in mmHg.
- Passive whole-blood flow: `Q = (P_from − P_to) / R`, in L/s; negative flow reverses the upstream donor.
- Plasma insulin: `concentration = amount / ((1 − Hct) × blood volume)`, in mol/L plasma. Advection transfers `Q × (1 − Hct) × upstream concentration` between exactly two pools.
- Muscle exchange: `PS × (plasma concentration − interstitial concentration)`. This transfers insulin without changing the 0.5 L effective interstitial volume.
- Clearance: compartment-specific `CL × local concentration`; removed amounts remain in cumulative ledgers.
- Left/right pump output is a normalized half-sine ejection during 32% of a prescribed 72 bpm cycle, averaging 5 L/min. It is not a ventricular/valve model.

Blood totals 5 L, with fixed 45% hematocrit: 2.75 L plasma and 2.25 L erythrocyte volume. This is a prescribed mixture; gas chemistry and individual blood cells are absent. Compartment volumes, compliances, resistances, exchange and clearance coefficients are synthetic design parameters. The [primary Windkessel model repository](https://models.physiomeproject.org/e/43/MainWindKessel.cellml/view) provides methodological context; this pilot is not its reproduction. A [primary rat insulin tracer experiment](https://pmc.ncbi.nlm.nih.gov/articles/PMC7824884/) motivates distinguishing clearance sites, without transferring its coefficients to humans.

The archived Sedaghat pathway observes the interstitial concentration. Its native pM/percent states and minute time basis are converted explicitly at the adapter. Its receptor states do not consume physical insulin or own transport fluxes. The existing whole-body engine remains separate; no duplicate glucose uptake is introduced. This is a transport-to-signaling connection, not completion of P4's meal-to-muscle uptake experiment.

## Verification

The [protocol](../validation/p3/protocol.json) was saved before implementation. The [numerical receipt](../validation/p3/verification.json) records conservative budgets, per-node volume ledgers, reverse-flow transport, pump integrals, route and clearance interventions, zero-pulse/exchange controls, step halving, replay compatibility and supported parameter corners.

An [independent Python transcription](../scripts/reference-circulation.py) uses SciPy DOP853 and physical insulin amounts in pmol, while the browser kernel stores mol. It imports the separately transcribed P1 native-M source pathway, with explicit unit conversion. [Its reference output](../validation/p3/circulation-reference.json) is computational evidence, not human measurements. Against that reference, the maximum observed pressure difference was **0.000117 mmHg**, insulin concentration difference **0.000130 pM**, and GLUT4 difference **2.36 × 10⁻⁸ percentage points**. Default blood-volume residual was **9.86 × 10⁻¹⁴ L**, and insulin-budget residual **5.34 × 10⁻²³ mol**.

Four circulation browser checks pass for actual moving/frozen pixels, compartment selection, consistent time through 3D inspection, causal interventions, saved replay, invalid import preservation and 320/390 px layouts. Full regression and capture receipts are tracked separately.

```sh
work/p1/venv/bin/python scripts/reference-circulation.py
npm run verify:circulation
npm run test:browser:production
```

## Remaining phase gates

This increment does not implement oxygen/hemoglobin or CO₂/buffer chemistry, explicit valves, autonomic control, measured human waveform comparison, microscopic velocity fields, fluid extravasation, physiological pancreatic secretion or receptor-mediated glucose uptake. Named routes are a lumped topology, not a verified reconstruction of vascular mesh junctions. Those remain required before P3 and M1 can be marked complete.
