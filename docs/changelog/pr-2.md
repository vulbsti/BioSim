# Blood flow along extracted vessel centerlines at simulated rates

Branch `sim-driven-assets`, stacked on `meal-to-muscle` (draft PR #1).

Before: the whole-body view drew blood trails on about 40 named vessels. Each trail averaged a mesh's vertices in 24 slabs along its longest axis, looped inside that one mesh, and moved at a single global speed scaled by cardiac output. Nothing crossed a junction, and the docs said so.

After: beads travel along centerlines extracted from all 1,061 packaged artery and vein meshes, pass through their junctions, and move in each vessel at that vessel's simulated speed. Exercise visibly speeds limb arteries; a meal speeds the splanchnic and portal route. Arterial beads surge with systole and venous beads move steadily.

How: `scripts/vessels/vessel_graph.py` (numpy and scipy, no Blender) resamples each surface to points 1 mm apart, sweeps surface distance from both extreme ends, cuts 3 mm bands and turns each connected ring into a centerline node. Meshes join where a vessel end touches or sits inside another vessel of the same circuit. Each circuit is oriented as a tree from its heart-side root. Every end branch is assigned one simulated bed by source name and a share of that bed's flow by radius cubed; a segment's share is the sum of its branches'. `app/physical/vessel-flow.ts` multiplies shares by the body state's organ flows, divides by lumen area for speed, and places beads by transit time from the root so they stay continuous through forks.

## Changes

- `public/models/vessel-graph.json` (1.1 MB): 3,482 segments with source mesh ID, junction kind, radius, polyline and bed shares. 1,679 touching-surface junctions, 29 inferred bridges (end gap at most 10 mm), 24 detached roots, 26 meshes skipped as copies, none unreached.
- `scripts/vessels/`: extractor, build script (`npm run build:vessels`), synthetic-tube tests (`npm run test:vessels`), and a Cycles diagnostic render script.
- `app/physical/vessel-flow.ts`: bed flows from `BodyState`, segment flow and speed, bead placement.
- `app/physical/PhysicalScene.tsx`: loads the graph, draws beads sized to each vessel, reports `data-aorta-flow`, `data-femoral-speed`, `data-cardiac-output`, `data-vessel-segments`.
- `app/physical/flow-routes.ts`: now airway and gut lumen illustrations only.
- `app/physical/motion.ts`: removed the unused global `bloodSpeed`.
- `docs/PHYSICAL_ANATOMY.md`: new "Vessel graph and blood flow" section with method and limits.

## Testing

Run on the author's machine; the repo has no CI.

- `npm run check`: passes.
- Unit suites: physiology 18, anatomy 8 (two new in `tests/vessel-flow.test.ts`), multiscale 11, tissue 9, circulation 6, P4 21. All pass.
- `npm run test:vessels`: 2 pass (straight tube centred with its radius; trunk with two branches, an overlaid duplicate and an adjacent vein).
- `npx playwright test`: 38 of 38 pass, including the new "blood beads ride the vessel graph" test.
- Cycles render on uxserver (Blender 5.2.2, RTX 2070, OptiX): four views of centerlines inside the source meshes, inspected by eye. Outputs are in the ignored `outputs/vessels/`.

## Known limits

- This is a display binding of lumped bed flows onto source geometry, not a hemodynamic solution. Radii come from artist-refined meshes and the radius-cubed split is a rule, not a measurement.
- The source atlas has no cervical internal carotid, so the intracranial arteries form a detached island fed from the vertebral end. The aortic root therefore carries cardiac output less the brain's share.
- Anastomoses are reduced to a tree; arteries and veins are not joined through capillary beds.
- The slowest end branches use a 4 mm/s display floor. Reported speeds are not floored.
- `build:vessels` uses the ignored `work/p1/venv` Python, like the existing reference scripts.
- The repo's receipts pin Blender 4.4.3; the diagnostic render used 5.2.2. Extraction does not depend on Blender.

## Review focus

- Junction rules and duplicate handling in `vessel_graph.build`.
- Bed assignment by source name (`BEDS`, `classify`).
- Bead clock synchronisation in `createVesselFlow.advance`.

## Rollback

Revert the commit. No saved-state formats, recordings or existing model files change.
