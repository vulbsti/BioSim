# Blender asset review — muscle pilot 0.2.0

Reviewed 2026-09-22 against the current repository bytes. This is an asset and pipeline audit, not an anatomical expert review. The package is a functional multiscale teaching prototype. It does not meet a “body-perfect” or biologically faithful asset bar.

## Evidence inspected

- `assets/multiscale/muscle-pilot/spec.json`, `build-receipt.json`, four saved `.blend` files, and their ignored `.blend1` backups
- `scripts/blender/build-muscle-pilot.py` and the runtime manifest
- all eight GLBs and `validation/p2/asset-verification.json`
- all four 900 × 900 Cycles previews at original resolution
- a fresh read-only Blender 4.4.3 topology inspection of each saved scene; machine-readable reports are under `validation/current-2026-09-22/blender-*.json`

The recorded generator, spec, manifest, saved `.blend`, preview, GLB, and BodyParts3D source-buffer hashes match the current bytes where the receipts declare them. This proves file identity. It does not prove build determinism, anatomical fidelity, or clinical validity.

## Blocking findings

### 1. Generated cylindrical geometry has topologically open UV seams

`Mesh.tube()` intentionally creates `segments + 1` vertices around each ring for periodic UVs, but does not weld the last position to the first in geometry. The cap faces reuse those duplicated seam vertices. Consequently, meshes that look closed have coincident but topologically disconnected longitudinal boundaries in addition to deliberately cropped ends or inspection windows. The tolerance audit confirms coincident boundary pairs (for example, 3 per fascicle fiber, 1,034 across the myofibril object, and 2,366 across the thick-filament assembly). This need not produce a visible crack in raster rendering, but it makes the meshes non-watertight and unsuitable as mechanical, collision, or volumetric domains.

Fresh saved-scene findings include:

| Structure | Connected components | Boundary/non-manifold edges |
|---|---:|---:|
| each fascicle fiber | 1 | 8 |
| fascicle capillary bundle | 5 | 30 |
| fiber myofibrils | 517 | 3,102 |
| fiber sarcolemma | 1 | 100 |
| sarcomere thick-filament assembly | 1,183 | 7,098 |
| each sarcomere thin-filament array | 178 | 1,068 |
| each Z-disc lattice | 30 | 180 |
| M-line links | 160 | 960 |

This is a topology limitation, not corrupt asset integrity and not a request to seal the deliberately exposed perimysium/sarcolemma windows or cropped specimen ends. Preserve the UV split through loop/corner UV data while sharing geometric seam vertices, classify every remaining boundary loop by a named intentional opening, and fail mechanical-domain validation on any unclassified loop.

The retained BodyParts3D source surfaces also are not watertight: FJ1442 contains 47 connected components and 742 boundary edges; femur FJ3365 has 44 and patella FJ3381 has 60 boundary edges. Because those meshes are source surfaces, preserve the original bytes and topology. If a closed simulation/collision derivative is required, create a separately named derivative with its transformation receipt and never present it as the untouched source mesh.

### 2. The microscopic geometry is schematic, repetitive, and incomplete

The preview evidence matches the implementation: the fascicle is a perfect hexagonal bundle of straight, equal-diameter cylinders; the fiber is another straight cutaway with a regular packed field and painted banding; the sarcomere is an isolated teaching lattice. These are readable diagrams, but visual readability must not be confused with tissue realism.

Missing or unsupported at the relevant scales includes:

- muscle architecture: measured fiber trajectories, regional pennation, aponeurosis/tendon continuity, epimysium, fascicle variation, and registration of the chosen microdomain inside FJ1442;
- fascicle tissue: endomysium around individual fibers, realistic extracellular spacing and collagen organization, nonuniform fiber diameters/shapes, and a branching/tortuous capillary network with junctions and endpoints;
- fiber ultrastructure: basal lamina, sarcoplasmic reticulum, T-tubules and triads, neuromuscular junction/nerve, internal and subsarcolemmal mitochondrial populations, and evidence-led distributions for nuclei and organelles;
- sarcomere proteins and mechanics: titin, nebulin, troponin/tropomyosin, compliant Z-disc/M-line organization, cross-bridge state, calcium/ATP coupling, force, and deformation continuity back through myofibril, fiber, fascicle, tendon, and joint.

Do not add cosmetic random bends, noise, roughness, or color variation as a substitute. Variation must be driven by a cited distribution, segmented imaging, or explicitly labeled artistic teaching intent.

### 3. Source proof is too weak for biological accuracy claims

BodyParts3D identity and buffer hashes establish the three macroscopic source surfaces. The two OpenStax pages establish a qualitative hierarchy and sliding-filament overview. They do not support the selected quantitative packing, counts, placement, vasculature, organelle distributions, or the geometry’s applicability to a particular human specimen.

Every authored measurement or distribution needs a parameter ledger with: stable parameter ID; value/range/distribution and units; tissue, species, age and physiological state; citation and exact figure/table/page; extraction method; uncertainty; authoring transform; and reviewer status. A source mesh hash is provenance, not proof that generated internal anatomy is correct.

### 4. LOD, collision, deformation, and render evidence are incomplete

- Muscle `context` and `detail` both contain 2,704 triangles and the same three entities. They are separate hashes but not a meaningful geometric LOD pair.
- No collision or simulation-domain meshes are declared. The visible meshes therefore cannot be assumed suitable for collision, perfusion, finite-element, or volume calculations.
- No armature, shape keys, material-point mapping, volume-preservation test, self-intersection test, or cross-scale deformation contract exists.
- Materials are flat Principled base colors plus roughness; only the myofibril material has a generated color texture. There is no evidence-led surface/volume response, subsurface behavior, normal/displacement detail, wet interfaces, or microscopy-inspired material calibration.
- The four previews use one orthographic beauty angle and common studio lighting. They lack turntables, back/side/cross-section views, wireframe and normal diagnostics, scale references, reference-image overlays, and consistent color-management receipts. A pretty render cannot establish topology or anatomy.

### 5. Reproduction is traceable but not yet a release-grade build

The current hashes and Blender version agree, and the source buffers remain untouched. However, the repository has no clean-room rebuild receipt comparing newly generated GLBs/previews to the canonical outputs, no dependency/environment lock beyond the Blender version string, and no atomic staging step before replacing canonical outputs. Blender’s ignored `.blend1` backups are outside the build receipt and can be mistaken for authoritative sources.

## Required acceptance gates before a higher-fidelity replacement

1. **Scope and claim gate** — declare each asset as source-derived, imaging-registered, literature-constrained representative, or artistic teaching geometry. Prevent UI copy from promoting one evidence class into another.
2. **Reference and parameter gate** — complete the parameter ledger. An anatomist reviews named structures and relationships; a relevant physiology/biomechanics reviewer separately reviews dynamic claims. Record disagreements and unresolved parameters.
3. **Registration gate** — define anatomical landmarks and coordinate frames from FJ1442 to the chosen fascicle region. Report landmark error and the transform chain. Do not imply donor registration without donor imaging.
4. **Morphology gate** — implement evidence-led fiber trajectories/pennation and packing, endomysium/perimysium/epimysium and tendon/aponeurosis continuity, plus a connected capillary graph. Compare declared distributions and volume fractions against cited targets.
5. **Ultrastructure gate** — model or explicitly defer SR, T-tubules/triads, basal lamina, mitochondrial compartments, peripheral nuclei, NMJ/nerve, and sarcomere regulatory/elastic proteins. Each omission remains visible in the manifest.
6. **Topology gate** — zero accidental non-manifold edges, loose geometry, degenerate faces, duplicate seam vertices, inverted normals, and unintended intersections. Every open boundary loop must map to a named cut or crop in the spec. Keep source defects distinct from generated defects.
7. **Dynamics gate** — define state ownership and mappings across sarcomere → myofibril → fiber → fascicle → muscle/tendon. Test length and volume behavior, collisions/self-intersections, landmark continuity, and picking under minimum/maximum deformation before calling it contraction.
8. **LOD and performance gate** — set screen-space error targets, preserve semantic IDs and silhouette/landmarks, provide a real reduced muscle context LOD, measure draw calls/GPU memory/frame time on named target devices, and test LOD transitions under deformation.
9. **Material and visual gate** — use calibrated reference sets and physically coherent material cues. Produce fixed-camera turntable, cross-section, wireframe, normal, depth, and scale-reference renders under locked color management. Review against the same references; never score realism from the beauty view alone.
10. **Reproducibility gate** — build into a fresh staging directory with the pinned Blender binary, capture command/environment/source hashes, independently inspect the produced bytes, compare semantic manifests and expected hashes, then promote outputs atomically. Exclude or clearly label `.blend1` backups.

Automated byte, topology, browser, and render checks may satisfy only their named gates. They must not set anatomical or biological review verdicts to `pass`; those require the cited evidence and signed reviewer records declared by policy.

## Next authoring package: reviewed human muscle-cell neighborhood

The next Blender increment should be one bounded, reviewable human vastus-lateralis neighborhood rather than a procedural expansion across the body. Use one declared specimen class and field of view containing several complete fiber cross-sections plus enough longitudinal extent to show their local organization. Keep the existing pilot available as a teaching prototype while this package matures independently.

Required source set:

- a licensed human skeletal-muscle imaging set with specimen metadata, acquisition method, voxel/pixel calibration, orientation, and stable source identity;
- matched or explicitly comparable histology/electron-microscopy references for myofiber boundary, basal lamina/endomysium, capillaries, nuclei, mitochondria, myofibrils, SR and T-tubule/triad organization;
- literature sources for every dimension or distribution that cannot be measured from the selected images, with population applicability and uncertainty recorded;
- FJ1442 coordinate frame and a declared approximate placement, or a clear statement that the neighborhood is unregistered. Do not infer donor correspondence from the shared tissue name.

Authoring deliverables:

- source images and annotations referenced by immutable IDs; segmentation masks or traced measurements; a parameter/evidence ledger; and a Blender scene whose semantic objects link back to those records;
- heterogeneous but measured fiber outlines and diameters, endomysial spaces, a connected local capillary graph, peripheral nuclei, mitochondrial compartments, myofibrils, basal lamina, SR, T-tubules/triads, and explicit placeholders for structures outside image resolution;
- a clean source-derived geometry layer, a separately named visualization layer, and separately named collision/simulation derivatives. No destructive editing of source-derived geometry;
- diagnostic render set with reference overlay, matching section planes, scale bars, semantic masks, topology/wireframe/normals, and fixed color management.

Acceptance requires: calibration and transform checks; measured-feature comparisons within predeclared uncertainty; zero unclassified topological openings; source-to-object traceability; anatomist signoff on structure identity and spatial relationships; physiology/biomechanics review of any dynamic claim; blind visual comparison against held-out reference fields; performance results on named target devices; and a clean-room reproducibility receipt. Any unresolved reviewer item keeps the package pending. A test suite alone cannot mark it anatomically ready.

## Recommended order of Blender-side remediation

1. Fix and regression-test the tube/link seam construction; extend the validator to classify boundary loops and connected components.
2. Add the evidence/parameter ledger and expert-review fields before increasing geometry detail.
3. Replace the fascicle’s uniform rod layout with an evidence-led architecture and connective-tissue/capillary model tied to a declared location and frame.
4. Build the fiber ultrastructure as semantic layers with explicit omissions, then connect it to the sarcomere dynamics contract.
5. Add actual LODs, deformation/collision derivatives, and the diagnostic render suite.
6. Run a clean-room reproducibility build and retain the new receipt before replacing canonical assets.

Until these gates pass, keep the manifest status `representative_visual_prototype` and the current disclaimers. Raising polygon count or rendering quality alone would not close the anatomical gap.

## Sprint 1 remediation — package 0.3.0 (2026-09-29)

This addresses the tooling items in the recommended order above. It does not change the asset claim: the status remains `representative_visual_prototype`, and no anatomical or biological review verdict is set.

| Gate | Change | Evidence | Still open |
|---|---|---|---|
| 6 Topology | Tube geometry moved to `scripts/blender/muscle_geometry.py`; closed tubes and links share seam vertices, with the UV split kept per corner. M-line links are trimmed into new lattice-node spheres so collinear links no longer share coincident end caps. The audit classifies every boundary loop against `spec.topology` and exits nonzero on any unclassified opening. | `topology-report.json`; `validation/p2/blender-audit/`; 10 Blender-free Python regression tests; Node tests weld the runtime GLB bytes by exact position and count edge uses | Crossing Z-disc links and M-line links entering their node spheres still interpenetrate as separate closed components; no union or intersection test |
| 8 LOD (partial) | Muscle `context` is a 0.35 decimation of each source surface: 944 versus 2,704 triangles, with the same entity IDs and bounds within 2% of span. Every level's context is now lighter than its detail. | `manifest.json`, tissue tests | Screen-space error targets and device frame-time measurements |
| Collision/simulation | Closed derivatives kept outside the runtime package: a 3 mm voxel-remeshed muscle/femur/patella domain (FJ1442 about 499 cm³ in three components) and per-component convex-hull or solidified-shell collision proxies for the fascicle, fiber and sarcomere. | `derivatives/derivatives.json`; GLB edge check | Not a validated mechanical/perfusion domain; no deformation contract yet |
| 10 Reproducibility | `npm run build:tissue` builds twice into fresh staging roots with the pinned Blender, audits both, requires byte-identical GLBs/manifest/reports/derivatives, compares entity identity with the canonical package and promotes by rename. It never writes `.blend1` backups. | `build-receipt.json` (schema 2) | `.blend` bytes are not reproducible (embedded pointers); they are compared semantically |
| 2 Parameter ledger (schema) | `parameter-ledger.json` gives every spec dimension an evidence class, source, locator, uncertainty and separate anatomy/physiology review fields. All 14 entries are honestly marked `representative-choice`, review `pending`. | Ledger test | Real measurements, citations with locators, named reviewers |
| 9 Diagnostics | `npm run render:diagnostics` produces turntable, cross/longitudinal sections, wireframe, normals and scale-bar renders under locked color management. | `validation/p2/diagnostics/` | Reference-image overlays require licensed reference imaging |

Gates 1–5 (claim, reference, registration, morphology, ultrastructure) and gate 7 (dynamics) are unchanged. They need licensed human imaging and expert reviewers, not more tooling.

## Sprint 1 remediation — follow-up (0.3.1, 2026-09-29)

Closes the four items the Sprint 1 remediation left open: the interpenetrating Z-disc/M-line lattice, the unquantified muscle-normals backfacing, the missing µ glyph, and the illegible sarcomere wireframe tile. No anatomical claim changed; `status` remains `representative_visual_prototype`.

### 1. Sarcomere lattice interpenetration — resolved by union

`pilot-z-left`/`pilot-z-right` (crossing horizontal/vertical links) and `pilot-m-line` (links entering their lattice-node spheres) are now each an exact Blender Boolean `UNION` of their component tubes/spheres (`union_components` in `scripts/blender/build-muscle-pilot.py`), computed in a unit-normalized frame for float robustness with nm-scale coordinates, then scaled back. A single dense flat lattice made every ring's coplanar link/link (or link/sphere) crossings numerically ill-conditioned for the exact solver; the fix keeps ring segment counts even (so bounding extents stay exactly symmetric, which the sliding-length tests require to float precision) but gives every ring a small constant angular phase (`Mesh.tube`/`Mesh.link` gained a `phase` parameter) so no ring vertex lands exactly on the shared symmetry plane. One further near-tangent configuration at exactly `phase = pi/segments` still left a sub-picometre sliver pair at one Z-disc lattice crossing (invisible to Blender's own index-based topology check, caught only by the independent GLB byte-level check); a small additional phase offset clears it. A generic pure-Python `weld()` (grid-hashed vertex clustering + degenerate/duplicate-face drop, unit-tested in `test_muscle_geometry.py`) runs as a real-world-tolerance safety net after the Blender-side cleanup.

Before (committed 0.3.0) / after (0.3.1), from `topology-report.json`:

| Entity | Before: components | Before: triangles (context/detail) | After: components | After: self-intersecting face pairs | After: triangles (context/detail) |
|---|---:|---:|---:|---:|---:|
| `pilot-z-left` | 30 | 720 / 960 | 1 | 0 | 9,268 / 9,452 |
| `pilot-z-right` | 30 | 720 / 960 | 1 | 0 | 9,268 / 9,452 |
| `pilot-m-line` | 251 | 5,836 / 8,208 | 1 | 0 | 13,256 / 12,168 |

Sarcomere level totals: context 16,580 → 41,096 triangles (675,100 → 1,095,144 bytes); detail 51,368 → 72,312 triangles (2,359,688 → 2,618,084 bytes). Both stay well inside `spec.policy.maximumTrianglesPerLevel` (180,000) and `maximumBytesPerGLB` (6,000,000). Full two-build reproducible pipeline (`npm run build:tissue`, both staging builds plus audits, determinism compare and promotion): ~75–100 s.

A per-entity self-intersection check was added to the topology audit/gate: `scripts/blender/blender_topology.py` builds a `mathutils.bvhtree.BVHTree` from each entity's own bmesh and calls `tree.overlap(tree)`, excluding face pairs that share a vertex (expected touching, e.g. adjacent quads on the same tube). `muscle_geometry.classify()` fails any generated entity with nonzero `selfIntersectingFacePairs` unless it is declared in the new `spec.topology.selfIntersection.allowlist` with a `maxPairs` and a `reason`. `pilot-thick-filaments` is allowlisted (detail LOD only, ≤15,000 pairs; the observed count is 10,626): its sparse illustrative myosin heads are short links protruding from the thick-filament tube surface and are not unioned into it — out of this remediation's scope, which covers only the Z-disc and M-line lattices, and now tracked explicitly rather than silently invisible. A separate, non-failing `crossEntityOverlaps` report (pairwise BVH overlap between different entities) is written at the top level of `topology-report.json`; it shows, as expected, that thin filaments overlap their anchoring Z-disc and the thick-filament array overlaps the M-line lattice by anchoring design (e.g. detail: `pilot-thin-left|pilot-z-left` 1,509 pairs, `pilot-m-line|pilot-thick-filaments` 2,560 pairs), and that the muscle level's FJ1442/FJ3365/FJ3381 source surfaces touch near the knee joint. `spec.topology.knownUnresolved` was rewritten to describe the two things that remain open (source-surface backfacing, and the anchoring cross-entity overlaps) instead of the now-fixed interpenetration.

`tests/tissue.test.ts`'s `'exported filament endpoints remain anchored…'` test (Z-disc bound midpoint at exactly `±length/2`, thin filaments anchored) and the sliding/`slidingSide` invariants were kept passing throughout — the even-segment-count-plus-phase construction was chosen specifically so the Z-disc bound symmetry stays exact after boolean union.

### 2. Muscle normals "pink patches" — quantified as real backfacing on the source, fixed only in derivatives

The pink/magenta patches are exactly what the diagnostic's own shader defines them as: backfacing faces (`geo.outputs['Backfacing']` mixes in magenta). A new `winding_consistency()` (`scripts/blender/blender_topology.py`) quantifies this without modifying the mesh: it duplicates each source surface into a throwaway bmesh, runs `bmesh.ops.recalc_face_normals` (Blender's own "Recalculate Outside" logic), and counts faces whose normal flipped versus the object's current (committed) winding.

Results, recorded per object in `topology-report.json` and the saved-scene audits:

| Source surface | context: inconsistent / total | detail: inconsistent / total |
|---|---:|---:|
| FJ1442 (vastus lateralis) | 3 / 514 (0.58%) | 35 / 1,470 (2.38%) |
| FJ3365 (femur) | 0 / 324 | 0 / 930 |
| FJ3381 (patella) | 0 / 106 | 0 / 304 |

So the inconsistent winding is real and specific to the muscle surface (FJ1442); the femur and patella are already consistently wound. Per policy, the source surfaces are never modified in place — `build_muscle`'s detail representation keeps the untouched BodyParts3D topology and winding. The two *derived* muscle representations are now made explicitly outward-normals-consistent instead: `decimate_context()` (the muscle context LOD) and the muscle simulation-domain voxel-remesh derivative both call the new `make_normals_consistent()` (a throwaway-bmesh `recalc_face_normals` written back to that derivative's own mesh) after their respective modifier evaluates. The diagnostics' normals render also now bakes an explicit two-line legend (camera-parented color swatch + text, using the same µ-capable font as the scale bar) reading "backfacing (inconsistent winding)" / "front-facing: color = normal * 0.5 + 0.5" directly into `normals.png`, so the color coding is unambiguous without an external caption; the render receipt (`diagnostics.json`) also records the legend as structured data.

### 3. µ glyph — bundled Latin font loaded for diagnostic text

Blender's own bundled `datafiles/fonts` in 4.4.3 only ships complex-script Noto variable fonts (Kannada, Gurmukhi, Khmer, Telugu, Thai, Tamil, Malayalam, Georgian, Arabic, Armenian, emoji) — none cover Latin-1 Supplement (U+00B5 MICRO SIGN), so this is not the "find one under Blender's datafiles" case as first suspected; the running system's DejaVu Sans (`/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf`), which does have the glyph, is loaded instead via `bpy.data.fonts.load()` in `render-diagnostics.py`, with a couple of alternate fallback paths (Liberation Sans, Noto Sans) if DejaVu is absent. The scale-bar and legend text curve objects now use this font. Verified visually (Read tool on the rendered PNGs) and confirmed in `diagnostics.json` (`scaleBar.labelFont`): fiber-level labels now read "10 µm" with a correct micro sign glyph instead of "10 um".

### 4. Sarcomere wireframe legibility — zoomed crop tile added, thinner lines

`render-diagnostics.py`'s wireframe shader line width dropped from 1.6px to 1.1px, and a second render, `wireframe-crop.png`, is added for every level: same camera direction and target as the full wireframe shot, but `ortho_scale` reduced to 10% of the full view. Verified visually on the sarcomere lattice, where individual thick/thin filaments and diagonal myosin-head cross-bridges are now distinguishable at the 160×160 contact-sheet tile size, versus the previous saturated cyan silhouette; the fiber level's packed myofibrils are similarly legible as individual lines. `render-diagnostics.mjs`'s `expectedFiles` list and the contact-sheet grid (which sizes itself from however many renders exist) both pick this up automatically.

### Verification run (2026-09-29)

`npm run build:tissue` (two-build determinism, byte-identical outputs, zero topology-gate failures) · `npm run render:diagnostics` (all four levels, contact sheets visually reviewed) · `npm run test:blender-geometry` (15 pure-Python tests, no Blender) · `npx tsx --test tests/tissue.test.ts` (9/9) · `npm run verify:tissue` (9/9) · `npx playwright test tests/browser/tissue.spec.ts tests/browser/sarcomere.spec.ts` (9/9). All passed.

### Still open

- `pilot-thick-filaments`' sparse illustrative myosin heads still interpenetrate their own thick-filament tube (allowlisted, not unioned; out of this remediation's declared scope).
- FJ1442's backfacing faces are quantified but, per policy, not repaired in the source-preserved detail representation (only its derived context LOD and the simulation-domain derivative are corrected).
- No reference-image overlay, anatomical review, or measured-parameter evidence was added; gates 1–5 and 7 remain as stated above.
