# Neck artery courses registered from one CT angiogram

Branch `claude/project-thread-qbuskw`, stacked on `sim-driven-assets` (draft PR #2).

Before: the four neck arteries that close the atlas's gaps (both cervical internal carotids, both prevertebral vertebral arteries) were cubic curves between source vessel ends. Their ends were right and everything between was invented; the right vertebral wall overlapped bone by 0.2 mm.

After: the same four segments follow the artery centerlines of a real neck CT angiogram (subject `s0504` of the TotalSegmentator CT dataset v3.0.0, CC BY 4.0), warped onto the atlas, pinned to the source vessels they join, and given calibres from the ledger. Both vertebral walls clear the vertebrae by 0.75 mm. The reconstructed curves stay in the build as the fallback.

How: `scripts/vessels/extract-neck-scan.py` runs where the imaging tools are (uxserver). It reads TotalSegmentator's open `total` and `headneck_bones_vessels` labels, bridges each carotid across the unlabelled fork, traces each vertebral artery by least-cost path through the contrast from the subclavian label to the C2-C3 level, centres all four with VMTK, and writes 23 landmarks and four centerlines to `models/neck-registration/s0504.json` (37 kB, committed). `scripts/vessels/build-registered-vessels.py` (numpy and scipy only) finds the same landmarks on the atlas by the same rules (`neck_landmarks.py`), fits a thin-plate spline, warps the centerlines, moves each to end exactly on its two source vessels, eases it off bone, and sweeps tubes. The output is a replacement package applied by mesh ID, like the calibre-adjusted vessels: a segment that fails a check is left out and stays reconstructed.

## Changes

- `public/models/registered-vessels.{json,bin,bin.gz}`: four tubes carrying the `RECON-` IDs and names, flagged `registered-from-imaging`.
- `docs/registered-vessels-provenance.json`: scan ID, licence, CT hash, per-landmark residuals, end corrections, radii, clearances, and which segments (none) fell back.
- `models/neck-registration/s0504.json`: the scan extract. No image data.
- `models/vessel-calibre/ledger.json`: four cited entries (common carotid 6.52 mm and cervical internal carotid 5.11 mm, Krejza 2006; left and right extracranial vertebral 3.49 and 3.20 mm, Spasojevic 2020). Their names match no packaged mesh, so the re-inflation step does not act on them. `docs/vessel-calibre-audit.json` changes only in its ledger hash.
- `scripts/vessels/`: `extract-neck-scan.py`, `neck_landmarks.py`, `build-registered-vessels.py`, `render-neck-registration.py`, `test_registered_vessels.py`. `atlas_io.py` applies the registered package as a second replacement; `build-vessel-graph.py` records its hash.
- `public/models/vessel-graph.json`: rebuilt; 3,672 segments (was 3,665), 1,774 touching junctions (was 1,770), inferred bridges and detached roots unchanged.
- `app/atlas-loader.ts`, `app/simulation/BodyMap.tsx`: load and apply the package; the selection note now reads "Course registered from one CT angiogram · calibre from published values · not atlas geometry", and the reconstructed note keys on the part's flag instead of its ID prefix.
- `package.json`: `build:vessels` runs the registered build between the reconstructed build and the graph.
- `public/ATTRIBUTION.md`, `docs/PHYSICAL_ANATOMY.md`: dataset credit and method.

## Results

- Registration: 19 landmarks. Left out one at a time, each is predicted by the others to a median of 2.71 mm (root mean square 3.54, worst 8.96, the foramen magnum). An affine map alone leaves a median of 3.63 mm. Fitted residuals are zero: the smoothing that predicted left-out landmarks best was none.
- Left out by rule: both carotid canal entries (predicted 21.4 and 19.4 mm from where the atlas has them). No atlas counterpart: the vertebral artery at C6 on either side (the source vessel starts above it).
- End correction before pinning: carotids 11.2 to 18.2 mm; vertebral arteries 20.8 mm (left) and 14.9 mm (right) at the subclavian, 1.1 and 1.2 mm at C6.
- Clearance (exact distance from every packaged wall vertex): vertebral segments 0.75 mm from the vertebrae; carotids 19.9 and 13.5 mm.
- Radii: carotids 3.26 mm below the scan's fork and 2.56 mm above it, eased to the source radii at the joins; vertebral 1.75 mm left and 1.60 mm right, narrowed to 1.44 and 1.38 mm where they enter the source vessel.

## Testing

Run on the author's machine; the repo has no CI.

- `npm run check`: passes.
- Unit suites: physiology 18, anatomy 8, multiscale 11, blender-geometry 15, tissue 9, circulation 6, P4 21. All pass. The anatomy suite now also checks that registered parts replace reconstructed ones by ID and that the brain is still supplied through all four neck segments.
- `npm run test:vessels`: 11 pass (8 new): exact distance to a sliver triangle; the spline recovers a bent affine map and drops a misplaced landmark; pinning lands exactly on both targets; the packaged vertebral walls, recomputed from the shipped buffers, are at least 0.3 mm from every vertebra, and a tube slid to 0.2 mm fails that check.
- Browser suite, served from this worktree on port 3026: 37 of 38 passed in the full run. The one failure (`simulation.spec.ts`, "brain connections, anatomy link and model disclosure work") timed out waiting for the full atlas view to load while two workers shared software rendering; run alone it passed in 52 s.
- Cycles render on uxserver: `outputs/vessels/neck-registration-preview.png` (ignored directory), before on top, after below, front and left views, inspected by eye.

## Known limits

- One scan of a 63-year-old woman, fitted to a male atlas. The bends are real anatomy but not this atlas subject's, and the end corrections above show the registration misses the vessels by one to two centimetres before pinning.
- The scan is the dataset's 1.5 mm resampling. Below C6 the vertebral arteries are distinct; inside the bony canal above it they cannot be told from bone, so the vertebral landmarks at C3 to C5 are weaker than the rest.
- The vertebral calibre was measured near the skull, not at the prevertebral part it is applied to. Both sources were read as abstracts only. The ledger says so.
- The source vertebral arteries are themselves partly sunk in C6. The registered segments join them 1.0 mm (left) and 4.9 mm (right) above their tips and enter narrowed; the source vessels are unchanged.
- The source internal carotid (about 3.7 mm) is narrower than the registered segment that meets it (5.1 mm); the last 8 mm tapers. Widening the source vessel is a ledger decision left to PR #2's owner.
- External carotids are still absent.
- No browser test selects a registered segment to read its note: these parts have no searchable concept.
