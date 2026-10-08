# Progress note: dive into a vessel at true scale

Date: 2026-10-07. Requested: show blood particles as dots from afar and as the 3D structure of the molecules when zoomed in, with assets built in Blender over SSH. After the first version, the request became: sizes must match the real ratio of vessel to molecule. Of three options offered, the dive with all four scales was chosen.

## What was done, in order

- Listed the species from `app/simulation/types.ts`: 5 transported substances, 31 hormones.
- Chose a structure for each and checked every wwPDB accession against the RCSB API. That caught three wrong candidates recalled from memory (an alpha-MSH complex for ACTH, a TSH analog, an hCG complex for LH).
- LH and inhibin B have no deposited structure. The first plan said AlphaFold; a labelled experimental relative (hCG, activin A) was used instead, because both are two-chain hormones.
- First version: enlarged molecules riding the vessel beads, mixed by a display share. Reviewed on the dev server: molecules were wider than their vessels. Fitting them inside the vessel fixed that but could not make the ratio real.
- Dive, second version. One procedural field per species at its true number density, drawn at one common scale.
- A helper compiled resting concentrations and cell counts into `blood-reference.json`. Many clinical sites refused automated access, so its backbone is the ABIM reference ranges PDF. It reported plainly which values rest on assumptions; those are marked approximate, and TRH, GnRH and renin are left out. I re-derived a dozen of its unit conversions by hand (cortisol, T3, testosterone, noradrenaline, leptin, IGF-1, PTH, calcitriol, ACTH, aldosterone, albumin, IgG) and they agree.
- Added albumin, IgG, fibrinogen, four ions, bicarbonate, and red cell, platelet and white cell models.
- First dive frames showed each species through its own depth of blood, so 676 platelets appeared beside 2,087 red cells. Everything now goes through one slab, and a class whose common members cannot be drawn is left out whole; the same view then showed 78 platelets.
- The nearest instances get the full model and the rest a plain ellipsoid, chosen by size on screen. Before that, the first instances in lattice order took the detail and large near ones were blobs.
- The vessel under the pointer is found from the picked surface point and the nearest flow centerline, because the mesh-to-segment table had no entry for the aorta's mesh.
- The working copy of `docs/PHYSICAL_ANATOMY.md` was found empty partway through (cause not established; another thread shares the checkout). It was restored from the latest commit and the new paragraph re-added.

## Verified

- Typecheck and all unit suites.
- The new browser test under software rendering, alone (1.2 min) and alongside two other files.
- Full browser suite: 38 of 41 before the dive test fix; the other two failures are a heart test that also fails on the parent commit and the brain-connections test that fails only on the shared server. Not rerun in full afterwards.
- Screenshots on the GPU renderer at each stop, after going to the nearest insulin, and after leaving.
- Scroll-in entry from the closest view (reached after about 70 wheel notches from the thorax view) and double-click entry.

## Not done

- Not pushed. No PR opened.
- The view at vessel width is a plain tube: blood is opaque red there and nothing is resolved.
- No haemoglobin or anything else inside cells; no lipoprotein particles.
- No flow or thermal motion inside the dive.
- No check of frame rate on a slow GPU. Budgets are fixed: up to 5,000 cells and 3,600 of each solute per frame, full models capped at about 1.1 million triangles per species.
- The build is not run twice and compared, as the muscle-pilot build is.
- No second source was sought for the approximate hormone concentrations.
