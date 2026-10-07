# PR 2 progress note: vessel graph and simulated blood flow

Written 2026-10-04. Step 1 of the simulation-driven assets plan (blood flow, then heart, meal route, tissue uptake, contraction and reflex).

## What was tried

1. **Mesh-edge geodesics.** Using source triangle edges as the distance graph fragmented every vessel: the meshes mix sliver triangles up to 67 mm long with dense caps. The abdominal aorta produced 930 false forks.
2. **Mesh subdivision.** Splitting triangles 1-to-4 produced 34 million vertices and an 8-minute build. Bisecting only the longest edge left T-junctions that broke ring connectivity inside each band.
3. **Point resampling (kept).** Filling each triangle on its own grid and keeping one point per 1 mm cell, then connecting neighbours by radius, gave clean tubes and a 21-second build.
4. **Single-source sweep.** Bands near the source end were discs around a rim point, so end nodes sat a full radius off-axis. Sweeping from both extreme ends and trusting the far end's distance near each end fixed the interior; the last two diameters at each closed end are now replaced by a straight run to the true end.
5. **Junctions by contact centroid.** Rejected. Source pieces overlap by about 2 cm at their ends, so the centroid of the contact region was far from either end and trunks were joined the long way round through side branches (the femoral artery ran backwards). The rule is now: a vessel end touches, or sits inside the lumen of, another vessel.
6. **Duplicates by surface coverage.** Rejected. The source's whole-vessel copies ("Descending aorta" over its thoracic and abdominal parts) are offset by more than a millimetre. Copies are now detected where one centerline runs inside another's lumen.
7. **Particles versus transit-time beads.** Tracked particles concentrate in large vessels (density scales with lumen area), leaving small vessels empty. Beads placed by transit time split at forks, stay continuous through junctions and populate every vessel.

## Decisions

- Extraction is plain Python so results do not depend on the Blender version; Blender only renders the check.
- Circuits never join each other: systemic arteries, systemic veins, pulmonary arteries, pulmonary veins, portal.
- Islands the source never connects are animated from their end nearest the trunk and flagged `detached`, not bridged over long gaps.
- "Hepatovenous segment" meshes are liver territories and are excluded.
- A branch end touching several wider vessels joins only the widest.

## Verified

- Flow conservation at every junction and unit share per bed at the roots (unit test over the shipped graph).
- Resting speeds: ascending aorta about 14 cm/s, inferior vena cava about 10 cm/s; exercise at 0.7 raises the aortic root to about 44 cm/s and the femoral artery about sixfold.
- Browser: beads present, aortic flow tracks cardiac output, exercise more than doubles femoral speed.
- Centerlines sit inside the lumens in the Cycles render and the browser.

## Pending or not done

- Portal vein speed reads about 40 cm/s at rest, above the physiological range, because the source portal lumen is narrow.
- Short, wide vessels (superior vena cava, pulmonary trunk) reduce to a nearly straight run, so branches joining them cut the corner.
- The left renal trunk attaches through the right renal trunk rather than directly to the aorta.
- Nutrient colouring on the portal route still switches on absorption as before; concentration-driven colour is step 3.
- No device performance measurement beyond the existing software-rendered browser runs.

## Follow-up, same day: neck arteries

Requested after review of the first commit: build the missing supply to the brain.

- Measured the gaps: 61 mm between each common carotid and the intracranial internal carotid; the vertebral arteries begin inside C6, about 45 mm above the subclavians.
- Generated four tubes along cubic curves between the source vessel ends. The first vertebral route approached C6 from the side and cut the transverse process; it now leaves the subclavian where the source vessel's axis, continued downward, passes closest, and rises along that axis. A relaxation step eases any point within 1 mm of bone away from it.
- With the brain attached, the shortest-path tree fed the basilar artery backwards from the carotids through the posterior communicating arteries. Two changes fixed it: path cost is now length over radius to the fourth, and communicating arteries are used only when a territory has no other route.
- Verified: reproducible binary, aortic root carries all systemic beds, all four segments carry brain flow, 38 of 38 browser tests, Cycles render shows the four segments joined at both ends.
- Not done: external carotids; calibre correction of thin source vessels (portal vein, vertebrals), which is the proposed next asset fix.

## Follow-up, same day: calibre ledger

Requested: fix the portal vein speed "the ideal way", by correcting the asset.

- Ledger holds only values with a citation. One entry so far: main portal vein 10.72 mm (Chau et al. 2023, abstract only; the uncertainty type was not verified from the full text, and the ledger says so).
- The source portal vein measured 7.14 mm. Radial factor 1.50; largest vertex move 2.56 mm; re-measured 10.72 mm.
- Source normals and triangles are reused, since radial scaling keeps surface directions. The archived atlas files are untouched; the loaders swap the mesh by ID.
- Verified: resting portal speed 17.9 cm/s (was 39.8), flow conservation unchanged, all suites pass.
- Not done: no collision check of the widened vein against the neighbouring hepatic artery and bile duct; superior mesenteric vein, splenic vein and vertebral arteries are still at source calibre for lack of a cited mean (and, for the vertebrals, bone canals).

## Follow-up, 2026-10-05: showing the model's state on the body

Raised in review: pressing Run changed nothing on the body, and loose dots sat on organ surfaces.

- Cause: the 3D view read 8 of the model's values (heart rate, breathing rate and depth, organ flows, cardiac output, food present, absorbing). At rest all 8 are constant. The dots were beads of vessels inside organs, drawn with depth testing off.
- Measured before building: after a meal the model's portal glucose rises about 1.8x and arterial about 1.2x at 30 minutes, and none of it was drawn.
- Built: substance lens (blood against resting arterial, organs against their own rest), flow-weighted venous mixing on the vessel graph, organ uptake labels from the transport step's exchange records, store labels, bladder swelling, simulated clock and a one-hour trend, depth-tested beads lifted by the vessel radius.
- Performance: recomputing tints every frame made the software-rendered browser test take over four minutes. Tints are now recomputed only when the solver hands over a new state or the lens changes.
- Not done: hormones as a lens (the body model has one global level per hormone, not per compartment); a tracked bolus front; scrubbing back in time; anything below organ resolution.
