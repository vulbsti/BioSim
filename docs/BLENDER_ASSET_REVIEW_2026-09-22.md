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
