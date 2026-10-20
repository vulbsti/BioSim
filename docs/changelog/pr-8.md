# Zoom from the meal route into muscle tissue

Branch `claude/project-thread-n3u9i3`, from `simulate` after PR #7 merged.

Before: the meal route ended at the thigh muscle with a number. The tissue explorer showed the muscle's structure, and linked to the body run only when the experimental meal pathway was on.

After: with the route shown, *Zoom into the muscle tissue* opens the tissue explorer on the fascicle, end-on, tied to the same body run. Dots drift along the five capillaries, coloured by the glucose in muscle blood, and dots cross from a capillary to a fibre beside it at a rate that follows the simulated net uptake. A readout gives the whole-muscle uptake in mg/min, how many molecules each crossing dot stands for in this segment, and the share of tissue glucose that came from the latest meal (those dots are gold).

How: `app/tissue/uptake.ts` reads the net blood-to-tissue glucose exchange the transport step records, and scales it to the segment by volume: the segment's 0.16 mm³ over the model's muscle volume. Dots per second follow the rate up to 40; molecules per dot is molecules per second in the segment over dots per second, so the scale is stated, not implied.

## Changes

- `app/tissue/uptake.ts` (new): `tissueUptake`, `segmentVolumeL`, `countInWords`.
- `app/tissue/TissueScene.tsx`: capillary stream and crossing dots at the fascicle level, drawn over the specimen.
- `app/tissue/TissueExplorer.tsx`, `tissue.css`: takes the body run whether or not the experimental pathway is on; the readout; opens on the fascicle end-on when entered from the route.
- `web/main.tsx`: `#tissue/fascicle` opens the explorer on the fascicle and passes the body run.
- `app/physical/PhysicalScene.tsx`, `physical.css`: the link under the route's station list.
- `tests/tissue-uptake.test.ts` (new, in `test:tissue`), one new test in `tests/browser/tissue.spec.ts`.

## Results

One hour after a 60 g carbohydrate meal at rest: muscle takes up 18.6 mg/min, capillary blood is at 1.16× resting, 72% of tissue glucose is from the meal, and each crossing dot is about 1.6 billion molecules in the segment.

## Verification

All on uxserver: typecheck; tissue 12/12 (3 new); anatomy 34/34; physiology 21/21; browser `tissue.spec.ts` 7/7 (1 new) and the meal route test in `physical-anatomy.spec.ts`. The new browser test caught two faults that were fixed: the zoom link sat under the camera-angle buttons and could not be clicked, and the scene kept its uptake attributes after leaving the fascicle.

## Limits

- The model has one muscle compartment, so every fascicle of every muscle shows the same rate. The capillary stream's speed is for display; capillary flow is not modelled at this scale.
- Dots cross in straight lines from capillary wall to fibre surface. Endothelium, interstitium and GLUT4 at the membrane are not drawn; with the experimental pathway on, the existing GLUT4 readout still applies.
- Which fibre a dot goes to is random among the three nearest; the fascicle geometry is the representative pilot, with five capillaries for 37 fibres.
