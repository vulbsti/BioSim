# Vastus lateralis multiscale pilot

A local Blender-authored **visual prototype**, version 0.2.0. It contains source muscle/bone surfaces and explicitly representative microscopic specimens, now including a length-controlled sarcomere lattice. It is not a registered human microscopic reconstruction or a functional muscle/vascular model.

## Files

- `spec.json`: visual, metric, topology, licensing and validation contract, recorded before generation.
- `blender/muscle.blend`, `blender/fascicle.blend`, `blender/fiber.blend`, `blender/sarcomere.blend`: editable Blender scenes in meters.
- `sarcomere-bands.png`: original procedural teaching texture; its repeat is illustrative.
- `build-receipt.json`: Blender output hashes and preview hashes.
- Runtime GLBs and manifest: `public/models/multiscale/muscle-pilot/`.
- Independent checks: `validation/p2/asset-verification.json`.

## Sources and license

**BodyParts3D, © The Database Center for Life Science, licensed under CC Attribution 4.0 International.** The muscle level extracts FJ1442 (right vastus lateralis), FJ3365 (right femur) and FJ3381 (right patella) from the project's existing 4.0 reference buffers. Original source coordinates are translated to the local muscle center; their inverse translation is retained. Normals are recalculated and geometry is re-encoded as GLB. Source surface topology and bounds are preserved within floating-point precision. Both muscle detail choices intentionally retain the same small source geometry.

[Dataset](https://dbarchive.biosciencedbc.jp/en/bodyparts3d/download.html) · [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) · [Project attribution](../../../public/ATTRIBUTION.md).

Generated fascicle, cell, capillary, organelle and marker geometry, and the banding texture, are original project work under the repository's MIT license. The organization is informed by [OpenStax, skeletal muscle](https://openstax.org/books/anatomy-and-physiology/pages/10-2-skeletal-muscle). No figure images, histology, or publication textures were copied. Prototype dimensions and populations are chosen illustrative values, not measurements from the source donor.

The new original MIT sarcomere geometry follows the qualitative [sliding-filament organization](https://openstax.org/books/anatomy-and-physiology-2e/pages/10-3-muscle-fiber-contraction-and-relaxation). It contains 91 thick filaments, triangular-interstitial thin-filament arrays, two anchoring Z-disc lattices, and central M-line links. Detail geometry adds sparse illustrative myosin heads; no protein/atom coordinates are imported. Filaments have representative fixed lengths of 1.6 µm (thick) and 1.0 µm (thin), with a 2.5 µm rest span. The runtime translates Z discs and their attached thin filaments across a 2.0–3.2 µm inspection range. Calcium, ATP, force, titin, troponin and tropomyosin dynamics remain unresolved. This is not a contraction solver.

Version 0.2.0 adds the sarcomere selection and length to saved views. Older 0.1.0 recordings are rejected with the existing compatibility error; there is no silent migration of package hashes.

## Rebuild

Use Blender 4.4.3:

```sh
blender --background --factory-startup --python scripts/blender/build-muscle-pilot.py
npm run verify:tissue
```

The local verified installation is `work/tools/blender-4.4.3-linux-x64/blender`. Its original archive SHA-256 is `8d3be07d2bc412b502c6bfe3cfe3e22195a4164076867da987ce148d73c27946`, checked against Blender's official checksum list. This portable installation is excluded from Git; it makes no system-wide configuration change.

Rebuilding replaces this prototype's generated GLBs, texture, `.blend` scenes, previews and manifests. It never overwrites the source atlas buffers. Saved tissue views reject different GLB hashes rather than silently replaying against changed geometry. Blender backups and Python bytecode are excluded from Git.

The optional `game-dev` CLI was unavailable in this environment. Production used the explicit local Blender script; package checks use `scripts/lib/inspect-tissue.mjs`. No plugin package-verification or clinical-review claim is made.
