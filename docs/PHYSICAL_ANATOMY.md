# Physical anatomy and visible physiology

The Whole body view renders 2,273 individually identifiable source meshes, 3,457 named concepts, and 2,548,238 triangles. The assembly contains the complete packaged 4.0 reference, 34 additional 4.3 meshes, and five older lung lobe surfaces. It is one adult male reference assembly, with incomplete structures and no claim of a perfect human digital twin.

## Watch a process

- **Circulation** shows the heart and vessels. The ventricular wall and associated cardiac geometry contract at the current heart rate. Bright trails indicate direction along selected large arteries and veins, with flow speed modulated by cardiac output and a visible systolic pulse. Pulmonary arterial trails use the oxygen-poor convention; pulmonary veins use the oxygen-rich convention.
- **Breathing** frames the lungs and trachea. Lung surfaces expand and the diaphragm descends during inspiration, then return during expiration. Air parcels reverse smoothly with the breathing cycle. Respiratory rate controls frequency and tidal volume controls excursion. The cycle readout and progress bar show the same phase used to deform the geometry.
- **Digestion** frames the abdomen. A new meal or water intake triggers a nine-second swallowing illustration. Stomach and duodenal parcels and small digestive surface waves appear when substrate is present. Portal nutrient trails appear only once carbohydrate/protein absorption is positive. Readouts connect stomach contents, intestinal contents and enzymes, portal absorption, insulin activity, and fat transfer into the model's lymph compartment. The current 3D animation does not trace the full lymphatic fat route.

The numerical simulation and anatomical animation have separate playback controls. Display cycles use current beats and breaths per real minute; 120× simulated time does not produce a 120× heartbeat animation. A paused numerical state can be previewed in motion and is labelled **State preview**. The Motion button freezes visual phase. Reduced-motion preference disables motion initially. Hardware rendering uses environment-lit materials with a 30 fps cap. Detected software GPUs use diffuse lighting, no environment prefilter, and a 12 fps cap while retaining all source geometry. In both paths, only visible triangle ranges are submitted, and a GPU fence limits the queue to one outstanding frame. Offscreen rendering is suspended. Camera navigation remains usable with motion paused.

Use layer presets, source-name search, exact structure selection, focus, isolation, hidden-part restoration, and sagittal/coronal/axial section controls. Expand opens a keyboard-contained dialog with Escape support. Section planes expose open source surfaces; they do not reconstruct internal cut faces.

## Source geometry and assembly

| Package | Meshes | Triangles | Contents |
| --- | ---: | ---: | --- |
| Archived 4.0 | 2,234 | 2,288,268 | Existing complete packaged atlas |
| Additional 4.3 | 34 | 55,562 | Thyroid, four parathyroids, cranial veins/sinuses |
| Lung surface references 3.0 | 5 | 204,408 | Three right and two left lung lobes |

The 4.3 OBJ headers supply the exact FMA identifiers and compatibility version. The import verifies membership against the official 4.3 manifest. Both source importers retain nondegenerate source triangles and apply the existing coordinate conversion: `[x_mm / 1000, z_mm / 1000 + 0.0781112, -y_mm / 1000 - 0.1]`. Duplicate source IDs are rejected. Shared concepts union their source membership without duplicating meshes.

Curated corrections classify hepatovenous segments as liver tissue, cerebral ventricles as nervous structures, and intracardiac papillary muscles as cardiac structures. The heart selection includes FJ2428, the ventricular wall missing from the source compound selection. Archived base buffers and source IDs are preserved.

The 3.0 lung contours fill a missing surface representation in the 4.0 package. **They are approximately aligned references, not registered 4.0 parenchymal surfaces.** No warp was applied. A trachea comparison across the two versions found a 21.56 mm maximum bounding-coordinate difference; nearest-vertex distances had a 1.60 mm median and 9.67 mm 95th percentile. This is a diagnostic comparison of different source meshes and sampling, not a registration accuracy measurement. The interface identifies the older references when selected.

[BodyParts3D's source documentation](https://lifesciencedb.jp/bp3d/info_en/index.html) describes incomplete concepts, artist-refined geometry and coordinate differences across major versions. Preserve the package-specific terms in [the attribution](../public/ATTRIBUTION.md), including the older sources' share-alike terms.

- [4.3 provenance and checksums](anatomy-expansion-provenance.json)
- [Lung provenance, pinned URLs and comparison](lung-surface-provenance.json)
- Import commands: `python3 scripts/import-anatomy-expansion.py ARCHIVE.zip OFFICIAL_FMA2Obj.txt`; `python3 scripts/import-lung-surfaces.py STL_DIRECTORY SOURCE_COMMIT` (the lung importer also consumes its recorded landmark comparison).

## Display mechanics and limits

These animations visualize model state; they do not feed force, volume, energy, or transport back into the solver. Cardiac contraction uses a smooth illustrative systolic envelope for 36% of a cycle. Inspiration occupies 40% of a display breath with cosine easing. These timing fractions, deformation amplitudes and gut wave speeds are display choices, not individually calibrated physiology. The direction of lung/diaphragm motion follows the qualitative mechanism in [OpenStax's breathing overview](https://openstax.org/books/anatomy-and-physiology-2e/pages/22-3-the-process-of-breathing).

Tracer curves average source vertices in 24 cross-section bins along the longest mesh axis. That produces readable paths for selected structures; it does not validate lumens, branching, centerlines, connectivity, regional velocity, or transit time. Trails deliberately remain visible through tissues. Aortic arches, branches and tortuous tubes particularly need verified centerline extraction before physical flow animation is possible. Cardiac and lung deformation does not currently enforce mesh contact, chamber-specific contractions, valve motion, or conservation of displayed volume. Picking uses the undeformed source surface and can differ slightly from the animated surface. Endocrine activities are numerical relative signals; the 3D view does not yet simulate hormone parcels circulating to receptors.

## Verification

`npm run test:anatomy` checks additive binary/gzip integrity, finite vertices and indices, manifest bounds, concept membership, display corrections, pulmonary tracer direction/color, Float32 boundary handling, cycle continuity, and solver-driven exercise/meal responses. `npm run audit:brain` audits the actual assembled atlas, including 27 new venous candidates. Browser checks exercise actual changing canvas pixels, a frozen paused frame, swallowing/absorption traces, reduced motion, source isolation, section controls, responsive expansion, and catalogue failure. These are implementation checks; biological calibration remains separate.

The browser configuration uses the full Chromium channel for both regular and headless runs, following [Playwright’s new headless-mode configuration](https://playwright.dev/docs/browsers#chromium-new-headless-mode). The final full headless run passed all 12 browser checks; 18 physiology and six anatomy checks also passed. A recorded runtime preview and verification receipt are saved in `outputs/verification/`.
