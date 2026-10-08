# Dive into a vessel: blood at true size and true count

Branch `claude/project-thread-szh8io`, stacked on `claude/project-thread-n3u9i3` (the meal wave and the heart, through commit daf897b).

Before: blood in the body view was dots on vessel centerlines at every zoom. Nothing showed what blood is made of.

After: double-click a vessel, or scroll in on it from the closest view, and the view goes inside it. Scrolling then changes the width of the view continuously from the vessel's own down to 4 nanometres, with a scale bar. On the way you pass red cells, platelets and white cells, then albumin, antibodies and fibrinogen, then ions, glucose and the other small molecules, all at their true sizes and in their true numbers. A panel lists what this blood holds and how far away the nearest molecule of each kind is; clicking a name goes to it.

The amounts follow the simulation: glucose, sodium and dissolved gases are the body model's own values for the blood that vessel carries, and hormone counts are the model's level times a cited resting concentration.

How: every species is laid on its own jittered lattice with exactly one member per cell (`app/physical/dive/field.ts`), so its density is exact and any view can be generated on demand in double precision. Positions are divided by the view's width before they reach the GPU, which is how one scene spans seven orders of magnitude in 32-bit floats. All species in a frame are drawn through one slab of blood so their numbers in view keep their true proportions. Models are built in Blender on uxserver from PubChem and wwPDB coordinates and from published cell dimensions.

## Changes

- `assets/molecules/`: `spec.json` (what to fetch or generate), `ledger.json` (accession, chains, method, download hash, licence or citation per model), `source/*.json`, `blood-reference.json` (compiled resting concentrations and cell counts with every source and conversion), `build.json`, `previews/contact-sheet.png`, `README.md` (what is real and what is not).
- `public/models/molecules/molecules.glb` (2.7 MB, 105,438 triangles, 47 meshes in nanometres) and `manifest.json`.
- `scripts/molecules/`: `fetch.py`, `build.py`, `package.py`, `reference.py`, `build-remote.sh`. Standard library and Blender only.
- `app/physical/molecules.ts`, `molecule-pack.ts`: the species list, manifest validation, hash-checked loading.
- `app/physical/dive/field.ts`: lattices, visiting a box, nearest member, formatting of lengths and concentrations.
- `app/physical/dive/composition.ts`: true amounts for arterial, venous or portal blood from the body state.
- `app/physical/dive/reference.ts`: generated; one resting value per species with how far it can be trusted.
- `app/physical/dive/dive-layer.ts`: the dive view, its controls, the panel and hover names.
- `app/physical/PhysicalScene.tsx`: loads the pack, finds the flow segment under the pointer, and hands the frame to the dive while it is active. If the pack fails to load the body view works without the dive and `data-dive-error` says why.
- `app/physical/physical.css`, `app/simulation/BodyMap.tsx`: dive styles; the note under the stage says how to dive.
- `public/ATTRIBUTION.md`, `docs/PHYSICAL_ANATOMY.md`: credit and method.
- `package.json`: `test:anatomy` runs `tests/molecules.test.ts`.

## What is not real, and where it is said

`assets/molecules/README.md` has the full list. The ones that matter most:

- Three hormones (TRH, GnRH, renin) are not drawn: no usable peripheral blood concentration was found. The panel says "no reliable value".
- Most hormone concentrations are approximate (assumed typical value under a reported upper limit, assumed unit conversion, or a source read only in excerpt) and may be off severalfold. They carry "≈" in the panel.
- LH and inhibin B are stand-in structures (hCG, activin A), labelled on hover.
- Amino acids, lipids and thyroid hormone are one representative molecule each.
- Positions are illustrative (even spacing; red cells in staggered stacks), thermal motion is frozen, water is not drawn, and red cells are solid with no haemoglobin inside.
- The red cell profile coefficients are those widely reproduced from Evans and Fung (1972) and were not re-checked against the paper's full text. The result (7.82 um across, 0.81 um centre, 2.57 um rim) sits in or just above the ranges in the opened sources.

## Earlier iteration, replaced

The first version on this branch drew the beads nearest the camera as enlarged molecules riding on the vessels, with a mix by display share. On review they were larger than their vessels, and no in-vessel size can be true (the aorta is 35 million glucose molecules wide). That approach was removed in favour of the dive.

## Testing

Run on the author's machine; the repo has no CI.

- `npm run check`: passes.
- Unit suites: physiology 18, anatomy 25 (7 new), multiscale 11, blender-geometry 15, tissue 9, circulation 6, P4 26. All pass.
- New unit tests (`tests/molecules.test.ts`): the pack matches the species list, its hash and per-mesh triangle counts match the GLB; every model has a source; sizes are real (red cell 7.82 um, sodium 0.102 nm, a red cell over 9,000 glucose molecules wide); a lattice sampled in a box holds its density within 2%, refuses a box over budget, and returns the same members each time; 90 mg/dL glucose reads 5.0 mmol/L, sodium 140 mmol/L, dissolved arterial oxygen about 0.13 mmol/L and less than half that in veins; insulin after a meal is over 1.8 times rest and portal glucose exceeds arterial; the three hormones without a value have density 0; the mean distance to the nearest insulin molecule is 1 to 4 um and to the nearest glucose 2 to 5 nm.
- New browser test (`tests/browser/dive.spec.ts`): double-clicking the aorta enters the dive; nothing is drawn at vessel width; at the cell stop red cells outnumber platelets by more than 8 to 1 and no molecule is drawn; at the molecule stop sodium outnumbers chloride, chloride outnumbers glucose more than fivefold, and no insulin is in view; the nearest insulin is 0.3 to 8 um away and going to it puts exactly one in view; 30 minutes after a meal the glucose in view is up by more than 15%; scrolling out returns to the body view.
- Browser suite on the shared dev server (port 3016), full run with two workers: 38 of 41 passed. The three failures: (1) the new dive test read its counts while the view was still easing to the molecule stop; it now waits for the stop, and passes alone and in a three-file run under load. (2) `physical-anatomy.spec.ts` "each heart chamber follows its simulated volume" also fails on an untouched export of the parent commit 7f94ca8 served on port 3028, so it is not caused by this change. (3) `simulation.spec.ts` "brain connections, anatomy link and model disclosure work" fails on port 3016 and passed earlier on a fresh server from the same files; the cause on 3016 was not found. The full suite was not rerun after the dive test fix.
