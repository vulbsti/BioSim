# Human Atlas

A connected physiology lab and interactive 3D anatomy explorer built with React, Three.js, and shadcn/ui. Take the BodyParts3D adult male reference apart into **2,273 individually selectable meshes**, explore **15 anatomical systems**, and search **3,457 named concepts**.

**[Explore the live demo](https://human-atlas-seven.vercel.app)**

## Physiology lab

The local app opens in a new simulation workspace. Run timed experiments with meals, water, inspired air, exercise, temperature, and sensory inputs. Follow organ flow, gas exchange, digestive enzyme activity, and 31 relative endocrine signals. Five substances travel through 23 explicit blood, tissue, and lymph-transit compartments; inspect local inventories, oxygen-limited metabolism, and source-to-destination flux receipts in the Transport view. Inspect a connected cerebral flow schematic and open matching structures in the original 3D anatomy viewer.

The Whole body view uses detailed source anatomy with animated heart contraction, breathing lungs and diaphragm, blood and air trails, swallowing, and digestive motion. Choose **Circulation**, **Breathing**, or **Digestion** for a close view with connected process readouts. Motion plays at current heart/breathing rates independently of accelerated simulation time; paused simulation can preview those rates. Pause anatomical motion separately, rotate the body, isolate structures, or use section planes. See [physical anatomy and animation coverage](docs/PHYSICAL_ANATOMY.md).

Pause, accelerate, or advance the simulation; schedule inputs; fork a comparison; export a run and load it later to resume. The engine runs in a Web Worker at fixed one-second steps. No service, API key, or account is required.

**This is an exploratory model, not a completed or biologically validated whole-human simulation.** Hormones currently use relative activities, distal vessels are grouped, and several mechanisms remain proxies. Read [the model equations, exact coverage, limitations, and remaining work](docs/PHYSIOLOGY_MODEL.md). The linked public demo predates these local changes until they are deployed.

## Molecular lab

Open **Molecular lab** from the physiology introduction, or visit `/#molecular`. Play and scrub a finite ligand pulse through blood, tissue, receptor binding and clearance. Change receptor availability and see the calculated response change. A second experiment reproduces the published Sedaghat 2002 insulin-signaling model, including PI3K, Akt and GLUT4 movement. Inspect local values, response curves and reaction accounting; export and reload experiments.

The new physical-unit kernel and independent-solver comparison are described in [the P1 implementation report](docs/P1_IMPLEMENTATION.md). These local mechanisms are isolated from the whole-body solver. The view uses schematic moving populations; new Blender anatomy and human-muscle calibration remain ahead.

## 3D tissue explorer

Open **Explore tissue in 3D**, or visit `/#tissue`. Inspect the source right vastus lateralis, a representative fascicle and a cut muscle-fiber segment. Pick named structures, reveal interiors, inspect the cut end, change geometry detail and follow a shared signaling playhead across scales. Editable Blender scenes and metric GLBs are included. [P2 implementation and exact coverage](docs/P2_IMPLEMENTATION.md).

The microscopic structures are representative, with no donor registration or functional muscle/capillary solver. Human calibration, brain assets and further phase gates remain open.

## Direction: whole-body biological simulation

The atlas (BodyParts3D reference assembly: 2,273 meshes, 15 systems, 3,457 concepts) is the spatial anchor. The `simulate` branch adds an exploratory organ-and-hormone lab (23 blood/tissue/lymph pools, 5 transported species, 31 relative hormone activities, 34-node/55-path cerebral schematic, fixed 1-second Web Worker steps with conserved, receipted transfers). The next goal is a multiscale reference simulation: supported mechanisms connect organ physiology to tissue, cell, receptor and reaction models, with explicit evidence and accounting at each scale.

Read [the multiscale execution plan](docs/MULTISCALE_EXECUTION_PLAN.md) for the Blender asset pipeline, blood/hormone transport, nervous-system and brain expansion, consistent body-to-cell zoom, and phase completion checks. The first milestone follows a meal through insulin signaling to muscle-cell glucose uptake and back to whole-body effects. [The phase tracker](docs/multiscale-roadmap.json) records **P0 complete; P1–P2 implementation in progress; P3–P10 pending**. This is a scoped research program, not a claim of an atomically complete human replica.

The earlier [biological simulation rationale](docs/BIOLOGICAL_SIMULATION.md) explains the original design. Read [the current model equations, exact coverage, and limitations](docs/PHYSIOLOGY_MODEL.md) before interpreting any simulated number. Numerical tests are not biological validation; nothing here is a clinical or predictive tool.

## Explore

- Orbit, zoom, and select structures directly on the body.
- Toggle individual systems or use skeleton and organ presets.
- Move from assembled anatomy to a spaced inventory of every visible piece.
- Search anatomical names and source identifiers.
- Isolate a selected structure and read its details.
- Use compact controls and detail panels on mobile.

## Run locally

Requires Node.js 22.13 or newer. No API keys or accounts are needed.

```sh
npm ci
npm run dev
```

Open http://localhost:3016. To build the static site, run `npm run build`; the output is in `dist/`.

## Validate

```sh
npm run check
npm run test:physiology
npm run test:anatomy
npm run verify:multiscale
npm run verify:tissue
npx playwright install chromium
npm run test:browser
npm run test:browser:production
node scripts/validate-atlas.mjs
node scripts/validate-interactions.mjs
npm run build
```

Validation covers mesh buffers, names and concept membership, nonoverlapping exploded layouts at desktop and mobile aspect ratios, search and inspection contracts, and tap-versus-drag handling. Browser interaction checks have exercised selection, system controls, search, isolation, rotation, and 390×844, 320×568, and 844×390 layouts. Phone controls stay clear of the exploded inventory, and isolated structures fit the space above or beside the detail panel. Physical-device performance and real multitouch hardware have not been tested.

## Anatomy data

The current viewer assembles **BodyParts3D 4.0** with 34 additive **4.3** thyroid, parathyroid and cranial venous meshes, plus five **3.0 lung lobe reference surfaces**. The 4.0 archive is CC BY 4.0; the additional packages retain the CC BY-SA 2.1 Japan terms carried by their sources. The older lung surfaces have approximate alignment, not validated registration. It does not represent every human structure or variation. Individual source meshes are distinct from named concepts, which may group multiple meshes. Descriptions distinguish general system context from individual organ explanations.

Geometry is simplified for browser performance while retaining every source mesh. The packaged model contains 2,548,238 triangles and downloads approximately 36 MB of compressed geometry. Full credits, source links, and adaptation details are in [ATTRIBUTION.md](public/ATTRIBUTION.md).

This is an educational explorer, not a diagnostic or surgical tool.

## How it works

Geometry is merged into batches. Per-structure GPU textures control translation, visibility, and selection, while component geometry supports accurate picking. Exploded layouts pack only the visible pieces. The original atlas renders on demand; the physiology view renders while anatomical motion plays and suspends rendering offscreen; orbit controls remain responsive without thousands of separate draw calls.

The optional WebMCP tools expose anatomy search and inspection in compatible browsers. The visible interface works without them.

## Rebuilding geometry

The repository includes browser-ready geometry. Rebuilding it is optional: obtain the official BodyParts3D OBJ archive and English metadata tables, prepare the joined concepts and display-system mappings, run `scripts/convert-anatomy.py`, then `node scripts/optimize-anatomy.mjs` and `node scripts/compress-models.mjs`. Simplification uses a 0.2% relative error limit per structure.

## Deploy

Import this repository into Vercel as a Vite project. The included `vercel.json` configures `npm ci`, `npm run build`, and the `dist` output directory. It can also be served by a static host.

## License

Original application code is released under the [MIT License](LICENSE). **Anatomy data has separate CC BY 4.0 and CC BY-SA 2.1 Japan terms**, as detailed in the attribution; preserve the applicable credit and share-alike requirements when redistributing adapted data. The [archived insulin model](models/sedaghat2002/README.md) retains its University of Washington source notice and separate copying terms. Third-party dependencies retain their respective licenses.

Issues and pull requests are welcome. Please include reproduction steps and browser/device details for interaction problems.
