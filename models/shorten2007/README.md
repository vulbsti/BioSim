# Shorten 2007 fast-twitch excitation–contraction source

Pinned Physiome Model Repository exposure `159ba2f081022ca651284404f39eeb40`, changeset `33944b1d8ee3227ebd32df9a7b1116c649632145`. All three downloaded source files are retained byte-for-byte, with SHA-256 values in `manifest.json`.

Authors: Paul R. Shorten, Paul O'Callaghan, John B. Davidson and Tanya K. Soboleva. Paper: *A mathematical model of fatigue in skeletal muscle force contraction* (2007), Journal of Muscle Research and Cell Motility, 28, 293–313. [PubMed](https://pubmed.ncbi.nlm.nih.gov/18080210/) · [Model and license](https://models.physiomeproject.org/exposure/159ba2f081022ca651284404f39eeb40/shorten_ocallaghan_davidson_soboleva_2007.cellml/view).

The CellML model is distributed by PMR under **Creative Commons Attribution 3.0 Unported**, [license](https://creativecommons.org/licenses/by/3.0/). This attribution and the original author/encoding metadata remain with the adapted code. The PMR page supplied raw generated C and Python exports under the same model exposure. No journal figure or prose was imported.

The source describes fast-twitch **mouse** skeletal muscle at its archived parameter settings, including temperature 293 K. It is not a human muscle fit. The application exposes a 500 ms excitation experiment, not the paper's long-duration fatigue validation. No parameter was fitted to the new visualization.

## Reproduction

1. `node scripts/generate-shorten.mjs` mechanically translates C assignment statements into `app/tissue/generated/shorten.ts`. It retains all 56 states, 105 constants, 71 algebraic variables and source array legends. This generated file carries the source checksum and attribution; do not hand-edit it.
2. `work/p1/venv/bin/python scripts/reference-excitation.py` integrates the separate archived Python equations using SciPy BDF. The generated Python's bundled example solver is not used.
3. `npx tsx scripts/verify-excitation.ts` checks archived hashes, the original stimulus waveform, all states against the reference, inventory invariants, interventions and a tighter-tolerance run. The protocol and receipts are under `validation/p5/`.

The runtime solver uses Dormand–Prince 5(4), with explicit steps adapted to error and source-state positivity checks. It splits at half-millisecond boundaries so every stimulus discontinuity is respected. The independent BDF comparison uses exact pulse boundaries and 0.5 ms output samples. No state is clipped back into range. Calculations run in a browser worker so the UI stays responsive; this stiff source currently takes several seconds to integrate the 500 ms window.

## Changes from source

Only the current input is replaced at the wrapper boundary: one 150 µA/cm², 0.5 ms pulse; the original nine-pulse 20 Hz sequence; or no current. Calling the generated RHS at source time -1 disables its hardcoded current and the wrapper adds the selected current divided by membrane capacitance to the surface voltage derivative. No other source equation depends explicitly on time. A separate intervention scales source constant 98, SR release permeability, from one to zero. This is an idealized perturbation, not a drug model.

Source milliseconds, millivolts, micromolar calcium/buffer/cross-bridge pools, millimolar phosphate, and µm³ compartment volumes are preserved. The complete legend identifies each state. Display time does not change the solver's time units. Archived initial conditions are not an equilibrium: no-current runs have an initial settling response. They are preserved for reproducibility.

Calcium inventory includes free and bound calcium in both cytoplasmic and SR volumes, regulatory-bound calcium and precipitated SR calcium. Adenine inventory includes source ATP, CaATP and MgATP. Converting µM × µm³ to moles uses `1e-21`. Conservation of these inventories does **not** establish a complete ATP hydrolysis/energy budget: the source's phosphate and ATP-buffer descriptions are not a whole-body energetic ledger.

The visual overlay reads concentrations of doubly calcium-bound regulatory states (`Ca_CaT2 + D_2 + A_1 + A_2`) and post-stroke bridges (`A_2`). It uses fixed disclosed brightness scales of 30 µM and 1 µM respectively, with saturation at intensity 1.5. No concentration is converted into an absolute rendered molecule count or a force in newtons.

The source equations contain no mechanical load or sarcomere length state. The activation view therefore holds the displayed sarcomere at 2.50 µm. That length is a visual boundary condition inherited from the asset, not a parameter affecting these source rates. Manual geometry inspection remains separate. No motor neuron/NMJ, titin, load-dependent shortening or body coupling is introduced.
