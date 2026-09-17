# Sedaghat 2002 no-feedback reference model

This is a pinned scientific fixture for Human Atlas P1, not a calibrated human-muscle or whole-body model.

- Paper: Sedaghat AR, Sherman A, Quon MJ. *A mathematical model of metabolic insulin signaling pathways.* American Journal of Physiology-Endocrinology and Metabolism 283, E1084–E1101 (2002). [DOI](https://doi.org/10.1152/ajpendo.00571.2001)
- [Archived JSim model 0166](https://www.imagwiki.nibib.nih.gov/physiome/jsim/models/webmodel/NSR/sedaghat2002insulinsignal), originally developed by Maris Lemba (2003), revised BEJ (2010-07-14).
- Variant admitted: `FEEDBACK=0`, 100 nM insulin for 15 minutes followed by withdrawal, observed through 60 minutes.
- Original `.mod` and `.proj` downloads are unchanged and checksummed in [manifest.json](manifest.json). Original URLs end in `Sedaghat2002_insulin_signal_0.mod` and `.proj` under the archive's `/sites/default/files/` directory.

`parameters.json` pins the numeric source constants. `parameter-provenance.json` records native units and conditions. Derived constants retain the original expressions in the archived source and independent reference script. The TypeScript model uses pM for the concentration states to improve numerical conditioning, preserving original M semantics.

`source/digitized-data.json` extracts the datasets stored in the `.proj` file. They are digitized source-paper comparison points, including Figure 10 dose responses; they are not a newly acquired independent human dataset and were not used to fit our implementation.

The source model includes percentage pools, prescribed extracellular insulin and source synthesis/degradation. Its parameters span multiple experimental preparations. The feedback variant has documented reproduction limitations and is excluded. See [P1 implementation](../../docs/P1_IMPLEMENTATION.md) for numerical receipts and exclusions.

## Source copyright and copy conditions

The source files retain the full University of Washington copyright and acknowledgement notice. The notice states academic use is unrestricted and permits copying with the copyright notice included. These source conditions are distinct from the repository's MIT application-code license. Preserve the original notice when redistributing the source or its adaptations. No source paper PDF is distributed in this package.

Attribution for the model equations and archived implementation is also retained in `app/molecular/sedaghat.ts` and `scripts/reference-insulin.py`.
