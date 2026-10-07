# What blood holds

One model for everything the dive into a vessel draws: the 5 transported substances and 31 hormones the body model carries, plus 3 plasma proteins, 5 ions and 3 blood cells that the model does not track but blood contains. 47 in all, in nanometres, in one GLB.

## What is real

- **Sizes.** Every model is at its real size, and the dive draws all of them at one common scale. A red cell is about ten thousand glucose molecules wide and it is drawn that way.
- **Structures.** Small molecules are PubChem3D conformers. Peptides and proteins are chains from wwPDB entries. Ions are spheres of their ionic radius. The red cell is the Evans and Fung (1972) biconcave profile. `ledger.json` records the accession, chains, method, download hash and licence or citation for each.
- **Counts.** Each species is laid out at its true number density (`app/physical/dive/field.ts`), from the amounts in `app/physical/dive/composition.ts`:
  - glucose, sodium and dissolved oxygen and carbon dioxide come from the body model's own state for the blood of the vessel dived into;
  - hormones, amino acids, lipids and calcium are the model's level against rest times a resting concentration from `blood-reference.json`;
  - potassium, chloride, bicarbonate, the three proteins and the three cells are reference values, because the model does not track them.

## What is not

- **Two structures are stand-ins.** No structure is deposited for LH or inhibin B. LH is shown as human chorionic gonadotropin (PDB 1HCN) and inhibin B as activin A (PDB 2ARV). Both say so on hover.
- **Three are one representative of a lumped pool.** Amino acids are drawn as L-glutamine at the total free amino acid concentration, lipids as palmitic acid at the free fatty acid concentration, and thyroid hormone as T3. Most lipid in blood travels inside lipoprotein particles, which are not modelled.
- **Several peptides are the receptor-bound conformation**, the only one deposited (ACTH, CRH, ADH, ANP, CCK, gastrin, secretin, GLP-1, ghrelin, TSH), without the receptor. ACTH and ghrelin are the resolved segments, PTH is 1-34, CCK is CCK-8. Fibrinogen is its crystallised core.
- **Three hormones are not drawn.** TRH, GnRH and renin have no usable concentration in peripheral blood in the sources found, so nothing is invented for them.
- **Many reference concentrations are approximate.** `reference.ts` marks each as `cited` (a reported mean or mid-range from a source that was opened) or `approximate` (an assumed typical value under a reported upper limit, an assumed unit conversion, or a source read only in excerpt). Approximate values carry a leading "≈" on screen and may be off severalfold. `blood-reference.json` says which sources were opened and which were not.
- **The layout is illustrative.** Positions are a jittered lattice, one member per cell, so density is exact but neighbours are more evenly spaced than in a liquid. Red cells are stacked in staggered layers because discs 7.8 um wide cannot be scattered at their real count without passing through each other.
- **Motion is frozen** apart from a slow tumble. Real thermal motion crosses the molecular view in well under a microsecond.
- **Water is not drawn.** At about 55 mol/L it would fill the view solid.
- **Red cells are solid.** The haemoglobin inside them, where nearly all of the oxygen is, is not modelled; only dissolved oxygen appears in plasma.
- **The white cell is one ruffled sphere** the size of a neutrophil, and the platelet a smooth lens.

## Rebuild

```bash
python3 scripts/molecules/fetch.py                        # download structures, write source/ and ledger.json
scripts/molecules/build-remote.sh uxserver --preview      # Blender build on the server, then manifest.json
python3 scripts/molecules/reference.py                    # regenerate app/physical/dive/reference.ts
```

`fetch.py`, `package.py` and `reference.py` use only the Python standard library. `build.py` runs inside Blender (built with 5.2.2 LTS). Outputs: `public/models/molecules/molecules.glb` and `manifest.json` (hash-checked by the app on load) and `previews/contact-sheet.png`.

To add or change a species, edit `spec.json`, add it to `SPECIES` in `app/physical/molecules.ts` and give it an amount in `composition.ts`. The app refuses a package whose species do not match.

## Licences

- PubChem: U.S. public domain data, https://www.ncbi.nlm.nih.gov/home/about/policies/
- wwPDB archive: CC0 1.0, https://www.rcsb.org/pages/usage-policy
- Generated cells and ions: original MIT geometry from the published dimensions cited in `ledger.json`.
