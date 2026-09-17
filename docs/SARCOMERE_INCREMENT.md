# Sarcomere visual mechanism increment — 2026-09-17

The active goal remains the full human-body visual simulation down to molecular mechanisms. This increment adds one missing level of muscle organization; it does not complete that goal, P2, or the neural/contractile P5 milestone. The preceding work is classified as progress: the current tree contains functioning circulation, tissue and molecular prototypes and their evidence. No previous Blender job was live at the start of this continuation.

## Implemented

Open `http://localhost:3016/#tissue` and select **Sarcomere**, or drill from muscle → fascicle → fiber → **Inspect sarcomere**. The fiber's old painted stripes now have a corresponding inspectable filament model.

The Blender package adds 91 thick filaments, thin filaments in triangular lattice interstices, two Z-disc anchoring grids and M-line links. Sparse myosin heads appear in detail mode. These are original representative meshes, with meter coordinates, named entities, physical dimensions and MIT provenance. They are not atomistic protein reconstructions or microscopic data from the BodyParts3D donor.

Sliding follows the qualitative organization described in [OpenStax section 10.3](https://openstax.org/books/anatomy-and-physiology-2e/pages/10-3-muscle-fiber-contraction-and-relaxation), consulted 2026-09-17. Parameters are disclosed illustrative choices. Each thick filament remains 1.6 µm long and each thin filament remains 1.0 µm. At a user-controlled sarcomere length L, each Z disc and its thin-filament array translates by `side * (L - 2.5 µm) / 2`. The M line and thick-filament positions remain fixed. The A band is therefore constant, each half I band is `(L - 1.6 µm)/2`, and the H zone is `max(0, L - 2.0 µm)`. The supported 2.0–3.2 µm range avoids opposite thin-filament interpenetration in this simple geometry.

Length, selection and anatomical scale persist through LOD changes and save/load. Section cuts and picking work after translation. Camera framing accommodates the maximum length without refitting on every slider movement. Nanometer labels retain small filament diameters. Archived insulin playback is unchanged and does not drive contraction.

## Artifacts and reproducibility

```text
assets/multiscale/muscle-pilot/
  spec.json                      # dimensions, source references, limits
  blender/sarcomere.blend         # editable metric source
  build-receipt.json              # source/preview hashes
public/models/multiscale/muscle-pilot/
  sarcomere-detail.glb            # 47,000 triangles; 2,298,852 bytes
  sarcomere-context.glb           # 13,304 triangles; 639,892 bytes
  manifest.json                  # package 0.2.0; identities and hashes
validation/p2/asset-verification.json
outputs/verification/p2/sarcomere/ # browser images and capture receipt
```

```sh
work/tools/blender-4.4.3-linux-x64/blender --background --factory-startup --python scripts/blender/build-muscle-pilot.py
npm run check
npm run verify:tissue
npm run test:browser:production -- tests/browser/tissue.spec.ts tests/browser/sarcomere.spec.ts tests/browser/circulation.spec.ts
node scripts/capture-sarcomere.mjs http://127.0.0.1:3016
```

The asset workflow used local Blender because `game-dev capabilities --json` returned command-not-found. Independent inspection is the repository's GLB verifier, not plugin package certification.

## Evidence

The compact [verification receipt](../validation/p2/sarcomere-verification.json) records the executed build, asset checks, final browser run and visual-review correction.

- TypeScript check passes. The production build passes, with the existing large-chunk warning.
- Five asset/recording tests pass across eight GLBs, including normals, indices, units, source bounds, identity, hashes and deliberately corrupted assets.
- The new geometry test reads actual exported GLB endpoint bounds at both LODs. It checks attachment metadata, fixed filament lengths, Z-disc anchoring throughout the allowed range, band dimensions and rejection of invalid length inputs.
- Thirteen targeted production browser tests pass: six tissue, three sarcomere, four circulation. New coverage exercises visible change on sliding, picking after translation, section clipping, LOD selection, saved length restoration, and 320/390 px layouts. This is not a fresh run of every whole-body test.
- Actual Chromium captures record lengths 3.2, 2.5 and 2.0 µm, oblique and mobile views, zero page errors and no mobile overflow. The detailed sarcomere submits six draw calls. CPU submission time is not a GPU/performance certification. PNGs and their SHA-256 values are retained in the capture receipt; generated outputs are Git-ignored.
- Visual inspection caught clipping of extended Z discs that functional browser tests did not catch. Framing was widened and captures regenerated.

## Remaining work

Length is prescribed by the user. There is no motor-neuron/NMJ excitation, T-tubule/SR calcium transport, troponin/tropomyosin regulation, ATP accounting, cross-bridge state, titin mechanics, active force or load response in this scene. Source-human microstructure registration, anatomical review, full-body coupling, molecular structures, other organ units, the brain package and hardware performance remain unverified or unfinished. The existing meal-to-muscle transport/uptake integration queue also remains open.

The next contraction increment needs a sourced and independently checked excitation/calcium/cross-bridge model with explicit state ownership before this visual motion can be driven by physiological state. The new geometry is its visualization substrate, not evidence that such a solver exists.

Saved 0.1.0 views are intentionally rejected under the existing package-hash policy because 0.2.0 adds new assets and state; the compatibility error leaves the current view intact.
