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
