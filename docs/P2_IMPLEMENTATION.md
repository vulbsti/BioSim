# P2 increment: muscle-to-cell anatomy inspection

Started 2026-09-10; verification continued 2026-09-13. **P2 is in progress**, with its first muscle package running locally. P1's physical-unit/identity foundations support this independent asset work; P1's human endpoint and calibration requirements remain open. This does not close P2's anatomical-review, brain-package, deformation or hardware-performance gates.

**2026-09-17 update:** package 0.2.0 adds a fourth scale, a Blender-authored sarcomere with length-controlled filament sliding. See [the sarcomere increment](SARCOMERE_INCREMENT.md) for current scope, validation and remaining work. The earlier browser/video receipts below describe the prior three-scale package; they are historical evidence, not receipts for 0.2.0.

## Try it

Open `http://localhost:3016/#tissue`, or choose **Explore tissue in 3D** in the physiology introduction.

1. Inspect the right vastus lateralis; optionally show its femur and patella context. **Locate muscle in full atlas** returns to the source anatomy explorer.
2. Choose **Explore fascicle** to open a representative bundle, then **Enter muscle fiber** for a representative cell segment. Breadcrumbs return to each scale and retain the selected structure there.
3. Drag to orbit, scroll/pinch to zoom, click geometry or use the structure selector. Compare an oblique view with **Cut end**. Hide the outer sheath or move a cross/longitudinal section plane. Clipped surfaces are intentionally open.
4. Choose lighter geometry. Identity and selection survive the change; only the current specimen is loaded. The source muscle is already small and retains identical topology in both settings.
5. Scrub or play the archived insulin response. The playhead and derived values remain unchanged by anatomical scale selection. At the fiber scale, the optional GLUT4 overlay changes marker brightness with the computed surface response.
6. Save a tissue view and load it again. The file records the package hashes, scale, selected structures, display controls, camera preset and mechanism playhead. It restores paused. Free-orbit camera pose is not serialized.

## What is built

| Scale | Contents | Evidence |
|---|---|---|
| Muscle | Right vastus lateralis, femur and patella | Three BodyParts3D 4.0 source surfaces; local translation recorded |
| Fascicle | 37 fiber segments, perimysium window, five capillary segments | Representative layout; capillaries occupy gaps between fibers |
| Muscle fiber | Opened sarcolemma, striated myofibrils, peripheral nuclei, mitochondria, adjacent capillary, erythrocytes and GLUT4 display sites | Representative 240 µm cell segment; not a complete fiber or measured microscopic reconstruction |
| Sarcomere | Thick and thin filament arrays, Z-disc lattices, M-line links, sparse myosin heads | Representative cropped filament lattice; manual sliding, no force/ATP/calcium solution |

[The asset package](../assets/multiscale/muscle-pilot/README.md) retains editable Blender scenes, its prior specification, source hashes, texture and build receipt. The runtime [manifest](../public/models/multiscale/muscle-pilot/manifest.json) declares meters, IDs, evidence status, levels of detail and inverse translation to atlas space. The same source surface is never presented as microscopic donor registration.

The shader colors and original banding texture are teaching materials. The hierarchy follows standard muscle organization; chosen diameters and counts are disclosed in the specification. [OpenStax muscle organization](https://openstax.org/books/anatomy-and-physiology/pages/10-2-skeletal-muscle).

`TissueScene.tsx` fetches only the selected GLB, checks its byte count and SHA-256, then imports it with the existing Three.js GLTFLoader. Display normalization is separate from metric asset coordinates. The scale bar estimates 100 CSS pixels at the orbit focus plane. Picking respects hidden structures and section planes. Prior geometry, materials, textures, listeners, requests and WebGL contexts are released when changing specimen or leaving the view.

The source-model calculation runs in a worker and remains independent of the renderer. Scale selection and LOD changes observe the same trajectory. GLUT4 markers are illustrative sites, not a molecular population count, and no forces or blood flows are inferred from their mesh positions. The inherited source model uses mixed cell preparations and is not calibrated to this human muscle. Whole-body glucose uptake remains uncoupled.

## Verification

`npm run verify:tissue` independently inspects GLB headers, chunks, buffers, finite positions/UVs, index ranges, unit normals, embedded textures, world-space bounds and stable entity IDs. It checks bounds against indexed vertices in the original packed atlas buffers after reversing the recorded translation, validates the interstitial layout, rejects manifest scale/identity drift and corrupt assets, and exercises recording compatibility. Catalogue extents differ slightly from the packed mesh bounds; the export check reads the actual source geometry with a 0.1 µm numerical tolerance.

The latest [asset receipt](../validation/p2/asset-verification.json) records five passing tests and eight inspected GLBs. Detailed triangle counts are **2,704 muscle**, **5,816 fascicle**, **31,696 fiber** and **47,000 sarcomere**; the detailed sarcomere GLB is **2,298,852 bytes**. Context LOD reduces the generated geometry. These are mesh counts and asset bytes, not a GPU-memory or physiological-accuracy claim.

The [production browser receipt](../validation/p2/browser-verification.json) records **23 passing tests, zero retries, zero failures**, including six tissue checks. They cover picking, section planes, cut-end viewing, source-model playback, paused frames, state preservation through scale/LOD, replay, invalid-import preservation, load errors, navigation and 320/390 px layouts. The remaining checks exercise the molecular lab and existing whole-body physiology/anatomy.

The [35.44-second browser demo](../outputs/verification/p2/tissue-explorer.mp4) shows all three scales, bone context, the exposed fiber interior and source-model signaling playback. [Its capture receipt](../outputs/verification/p2/capture.json) retains the actual final playhead, browser version, video properties and artifact hashes; the run produced no page errors or mobile horizontal overflow. Desktop and mobile PNGs, Blender previews and the source WebM are in `outputs/verification/p2/`. These generated captures are ignored by Git; reproduce them with `node scripts/capture-tissue.mjs http://localhost:3016` while the local server is running.

```sh
npm run check
npm run verify:tissue
npm run test:browser:production
```

The production test command serves a fixed build to avoid development reloads during rendering checks. The scene's disclosed CPU submission time is not GPU frame time; physical-device GPU/memory budgets remain unverified.

## Remaining work

P2 still requires a reviewed brain-region package, registration/landmark evidence, anatomical review and deformation/picking checks for contractile geometry, plus declared device-performance evidence. The microscopic hierarchy here is a representative teaching model. No brain topology, nerve circuit, pressure/flow domain, force production or donor-specific cellular map is introduced by this increment.

P1's independent human endpoint mapping and acceptance bounds remain open. The following P3/P4 increments must connect physical hormone transport and local uptake through ownership contracts, replacing the corresponding coarse effects so that uptake is counted once. An animated overlay alone does not meet that gate.
