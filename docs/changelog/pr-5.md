# Follow one meal through the body

Branch `claude/project-thread-n3u9i3`, from `simulate` after PRs #1 to #4 merged.

Before: the glucose colour showed the level in each place. It could not tell a meal's glucose from what was already in the blood, so after a meal the whole body warmed slightly and nothing showed where the meal itself had gone.

After: *Colour by → This meal* follows the most recent meal. At ingestion only the stomach is lit. Over the next minutes the small intestine warms, then the portal vein and liver, then the arteries and the tissues they feed. Organ labels give the grams of the meal each holds, and a strip shows where the meal's carbohydrate, protein and fat are now: stomach, intestine, blood, tissues, stored, burned, excreted. A new meal takes over the mark.

How: the solver labels a meal's nutrients when it is eaten. Every existing transfer moves the label in proportion to the labelled share of its source, advection reads labels from the same old state as amounts, and blood and tissue exchange the label in both directions on its own gradient. Reserves and sinks outside the compartments (glycogen, fat and protein reserves, oxidation, urine) hold the label too, so it always sums to what was eaten.

## Changes

- `app/simulation/types.ts`, `transport.ts`: `MealMark` on the transport state; `markMeal`, `carryMark`, `markedTotal`; `transfer` takes the size of an outside source so the label leaves it in proportion.
- `app/simulation/engine.ts`: a meal sets the mark; gastric emptying, absorption, glycogen release and fat release carry it.
- `app/simulation/recording.ts`: saved runs keep the mark and are rejected if it is negative or not conserved; runs saved before this change resume with no meal marked.
- `app/physical/body-lens.ts`: `mealLevels`, `mealOrgan`, `mealHeld`, `mealFate`, `mealLumen`.
- `app/physical/PhysicalScene.tsx`, `physical.css`: the lens, its legend, the organ labels and the fate strip.
- `tests/meal-mark.test.ts` (new, in `test:p4`), `tests/body-lens.test.ts`, `tests/browser/physical-anatomy.spec.ts`.

## Results

- 60 g carbohydrate, 20 g protein, 15 g fat at rest. After 5 minutes: portal blood carries 0.37× resting arterial glucose from the meal, arterial 0.15×. After 30 minutes: portal 1.30×, arterial 0.76×. After two hours: 33 g of the carbohydrate is liver glycogen, 11 g is burned, 7.6 g is still in the stomach and intestine.
- A marked run and the same run with the mark switched off are identical in every value other than the mark.
- The label sums to the meal within 1e-9 g at every check over four hours and never exceeds what a pool holds.

## Verification

Typecheck; physiology 18/18; anatomy 11/11; meal pathway 26/26 (5 new); multiscale 11/11; tissue 9/9; circulation 6/6; browser `physical-anatomy.spec.ts` 6/6.

## Limits

- Blood compartments are well mixed, so no front travels along a single vessel.
- The model moves only net amounts between blood and tissue, so arterial glucose is about two thirds meal-derived at 30 minutes, faster than tracer studies report. The label itself exchanges in both directions.
- Glucose made from labelled amino acids is not labelled; that carbon is counted as burned protein.
- The colour follows carbohydrate only. Protein and fat appear in the strip.

## Added 2026-10-07: the heart beats chamber by chamber

Before: the whole heart squeezed 4% toward one point on a fixed easing curve, and the readout said "Systole" for the first 36% of every beat.

After: a four-chamber heart model solves the beat the body state implies, and each chamber's mesh follows its own simulated volume. The atria contract before the ventricles, the ventricular wall thickens as the cavities empty, and the readout names the phase (isovolumic contraction, ejection, isovolumic relaxation, filling, atrial contraction) with the left ventricle's volume.

- `app/simulation/heart.ts`: time-varying elastance chambers, diode valves, two-circuit loop; solved to a steady beat per operating point and kept.
- `scripts/heart/build-heart-motion.ts`, `public/models/heart-motion.{json,bin}`: the rig, 84 heart meshes and 41,279 vertices; `npm run build:heart`.
- `app/physical/heart-motion.ts`, `PhysicalScene.tsx`: the vertex motion and the phase readout.
- `tests/heart.test.ts`, `tests/heart-motion.test.ts` (in `test:anatomy`), one new browser test.

Results at rest (72 beats/min, 70 mL, 93 mmHg): left ventricle 124 to 54 mL, ejection fraction 0.56, aortic pressure 115/73 mmHg, right ventricle peak 24 mmHg, left ventricular end-diastolic pressure 8.5 mmHg, atrial contraction 22% of filling. Source cavity meshes: 98, 117, 84 and 52 mL (left ventricle, right ventricle, right atrium, left atrium). Each cavity mesh's volume equals the simulated share within 1e-4.

Verification: heart 4/4; heart motion 3/3; body lens 3/3; physical anatomy 6/6; vessel flow 2/2; physiology 18/18; meal pathway 26/26; circulation 6/6; browser `physical-anatomy.spec.ts` 7/7 (run with the molecule thread's uncommitted edits also in the working tree).

Limits: parameter values are representative, not read from a source file or fitted. Motion is radial about each cavity's centre: no twist, no long-axis shortening, and the leaflets move with the wall but do not open or close. Vessel beads on the coronary arteries do not move with the wall. The beat does not feed back into the body model.

## Added 2026-10-07: valves open and close, and a conduction system

Before: the leaflets rode with the wall but never moved, and the heart had no conduction system.

After: every valve's leaflets swing between closed and open with the simulated valve state, and ten new heart parts trace the conduction system and light in order as the impulse passes.

- `scripts/heart/build-heart-package.py`, `scripts/heart/heart_source.py`: the Blender build. Outputs `assets/heart/valves.{json,bin}` (per-vertex move from closed to open), `public/models/heart-conduction.{json,bin}`, `docs/heart-package-provenance.json`, `assets/heart/blender/heart.blend` (leaflets with an "open" shape key, conduction meshes) and `assets/heart/previews/`.
- `scripts/heart/build-heart-motion.ts`: the rig now covers the conduction parts and carries the leaflet moves; cavity radius is averaged over direction so it varies smoothly.
- `app/atlas-loader.ts`, `app/anatomy.ts`: the conduction package joins the atlas as heart parts.
- `app/physical/heart-motion.ts`, `PhysicalScene.tsx`: leaflet motion in the vertex shader, valve easing, conduction glow.

Results: clear opening radius, closed to open: mitral 4.85 to 11.62 mm, tricuspid 3.95 to 11.59 mm, aortic 1.71 to 9.07 mm, pulmonary 1.37 to 10.92 mm. Two Blender builds give identical valve and conduction binaries.

Verification: heart 4/4; heart motion 6/6; body lens 3/3; physical anatomy 6/6; vessel flow 2/2; meal mark 5/5; physiology 18/18; browser `physical-anatomy.spec.ts` 7/7.

Correction to the note above: the source does contain chordae. They are part of the mitral and tricuspid leaflet meshes.

Limits: open shapes and conduction courses are constructed, not from imaging, and not reviewed by an anatomist. Open mitral and tricuspid leaflets are faceted where the sheet meets its chordae. A cusp's wall-side face moves about a millimetre. Conduction timing is fixed intervals around the model's two onsets, not an electrical simulation. The Blender build was run with 5.2.2 on uxserver, not the 4.4.3 pinned for the muscle package, and is not part of `build-package.mjs`.
