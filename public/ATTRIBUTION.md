# Anatomy data attribution

BodyParts3D, © The Database Center for Life Science licensed under CC Attribution 4.0 International.

- License: https://dbarchive.biosciencedbc.jp/en/bodyparts3d/lic.html (updated 2025-02-27)
- Dataset: https://dbarchive.biosciencedbc.jp/en/bodyparts3d/download.html
- License terms: https://creativecommons.org/licenses/by/4.0/
- Source geometry: `isa_BP3D_4.0_obj_99.zip`, BodyParts3D 4.0.
- English names and relationships: IS-A and PART-OF concept, element, and inclusion tables from the same archive.
- Publication: Mitsuhashi et al. (2009), BodyParts3D: 3D structure database for anatomical concepts. https://doi.org/10.1093/nar/gkn613

Adaptations: axes and units converted from millimeters/Z-up to meters/Y-up; translated to rest at the stage; geometry simplified using meshoptimizer with 0.2% relative error limit per structure; normals quantized to signed 16-bit; packed into binary chunks; curated display system groupings and colors. The source contains 2,234 individual OBJ meshes; all remain represented. The combined hierarchy contains 3,432 named FMA concepts, which may reference multiple meshes. Original source identity is preserved in the manifest.

Source OBJ comments mention an older CC BY-SA 2.1 Japan license. The official current database license linked above supersedes that legacy text and explicitly permits redistribution and adaptation under CC BY 4.0.

BodyParts3D represents an adult male reference anatomy based on TARO MRI and anatomical illustration refinements. It is not a complete model of every possible human anatomical structure or variation. This interface is educational and is not a clinical tool.

## Additive 4.3 reference geometry

BodyParts3D, Copyright © 2008 The Database Center for Life Science, licensed under Creative Commons Attribution-ShareAlike 2.1 Japan, as carried by the Anatomography source. The archive's current CC BY 4.0 license is linked above; this additive package retains the source's share-alike terms.

- Source service: https://lifesciencedb.jp/bp3d/
- Official 4.3 concept-to-OBJ manifest: https://lifesciencedb.jp/bp3d/get-info.cgi?version=4.3&cmd=concept-objfiles-list
- Source license: https://lifesciencedb.jp/bp3d/info_en/license/index.html
- License terms: https://creativecommons.org/licenses/by-sa/2.1/jp/
- Packaged derivatives: `models/expansion.json`, `expansion-4.3.bin`, `expansion-4.3.bin.gz`.

34 meshes add three thyroid parts, four parathyroids, and 27 cranial veins/sinuses. Source headers identify compatibility version 4.3 and exact FMA names. Adaptations: same axis/unit/translation conversion as the base atlas; coincident vertices welded; degenerate triangles removed; normals recalculated and quantized; geometry packed into binary buffers. 55,562 triangles remain. Per-source hashes and version evidence are in `docs/anatomy-expansion-provenance.json` in the repository.

## Lung surface references from 3.0

BodyParts3D, Copyright © 2008 The Database Center for Life Science. STL conversion and distribution by Kevin Mattheus Moerman. Licensed under Creative Commons Attribution-ShareAlike 2.1 Japan as distributed by the source repository; these adapted lung-surface data retain that license.

- Source and credits: https://github.com/Kevin-Mattheus-Moerman/BodyParts3D
- Pinned source revision: `f0eeb6e843380cfe6b83797cf8c3e1af74de5e61`
- License terms: https://creativecommons.org/licenses/by-sa/2.1/jp/
- Packaged derivatives: `models/lung-surfaces.json`, `lung-surfaces.bin`, `lung-surfaces.bin.gz`.

Five lobe surfaces (FMA7333, FMA7337, FMA7370, FMA7371, FMA7383) retain all 204,408 source triangles. Adaptations: same unit/axis/translation conversion, welded vertices, recalculated and quantized normals, binary packing, display colors, and illustrative breathing deformation. No registration warp was applied. These older lung surfaces are approximately aligned overlays; they do not establish exact correspondence with the 4.0 airways. Pinned URLs, hashes, bounds, and a cross-version trachea comparison are recorded in `docs/lung-surface-provenance.json`.

## Neck artery courses registered from imaging

Wasserthal J. et al., *TotalSegmentator CT dataset* v3.0.0, University Hospital Basel. Licensed under Creative Commons Attribution 4.0 International.

- Dataset: https://doi.org/10.5281/zenodo.6802613 (version record https://doi.org/10.5281/zenodo.22688904)
- License terms: https://creativecommons.org/licenses/by/4.0/
- Publication: Wasserthal et al. (2023), TotalSegmentator: Robust Segmentation of 104 Anatomic Structures in CT Images. *Radiology: Artificial Intelligence* 5(5). https://doi.org/10.1148/ryai.230024
- Subject used: `s0504` (one CT angiogram of the neck). No image data is redistributed.
- Packaged derivatives: `models/registered-vessels.json`, `registered-vessels.bin`, `registered-vessels.bin.gz`.

Adaptations: the scan was segmented with TotalSegmentator's open `total` and `headneck_bones_vessels` models (Apache-2.0); the vertebral arteries were traced through the contrast and all four artery centerlines extracted with VMTK (BSD). Only those centerlines and 23 landmark positions leave the scan. The centerlines were warped onto the BodyParts3D atlas by a thin-plate spline on 19 paired landmarks, moved to end exactly on the atlas vessels they join, eased off atlas bone, and swept into tubes whose calibre comes from published adult values, not from the scan. The four resulting segments are the course of one person's arteries fitted to a different person's skeleton. They are not BodyParts3D geometry and not a measurement of the atlas subject. Landmark residuals, end corrections and bone clearances are in `docs/registered-vessels-provenance.json` in the repository.

## Viewer adaptations

The physiology renderer applies tissue colors, transparency, anterior display cuts, optional section planes, and temporary illustrative heart/lung/diaphragm/digestive deformation. It also corrects display grouping for hepatovenous liver segments and cerebral ventricles, and includes the source ventricular wall in heart selection. Source identities and archived base buffers remain unchanged. Tracer paths are approximate visual guides and do not establish vessel junctions.

## Historical assets (not included in the current release)

Earlier repository revisions included female reference anatomy: Kristen Browne and Heidi Schlehlein, Human Reference Atlas / HuBMAP, *3D Reference Organ Set for Female v1.5* (2023). CC BY 4.0. Geometry adapted for this viewer.

- Source DOI: https://doi.org/10.48539/HBM352.BTSQ.586
- Dataset: https://lod.humanatlas.io/ref-organ/united-female/v1.5
- Original GLB: https://cdn.humanatlas.io/digital-objects/ref-organ/united-female/v1.5/assets/3d-vh-f-united.glb
- License: https://creativecommons.org/licenses/by/4.0/

Adaptations: translated native meter/Y-up coordinates onto the stage, coincident vertices welded and source normals averaged, geometry simplified with a 0.2% per-structure relative error bound, and normals quantized. Colors and display systems are curated for this interface. All 888 source meshes are represented, with 1,073 source nodes available as selectable individual or compound concepts.

This is a reference assembly with whole-body surface and selected organs, including female reproductive anatomy. Its skeleton and muscle coverage is partial. It is not a complete model of every human structure or a single-person scan. Eight placenta/umbilical structures are classified under Pregnancy reference and hidden by default.

## Multiscale muscle prototype

The muscle-level GLBs in `models/multiscale/muscle-pilot/` re-encode BodyParts3D 4.0 FJ1442, FJ3365 and FJ3381 (right vastus lateralis, femur and patella), under the CC BY 4.0 credit above. Source geometry is translated to a local center, normals recalculated, and surface topology retained. The inverse translation, source-buffer hashes and IDs are recorded in the package manifest.

The fascicle/fiber geometry and banding texture are original representative project assets under MIT. Their hierarchy is informed by OpenStax Anatomy and Physiology, section 10.2 (https://openstax.org/books/anatomy-and-physiology/pages/10-2-skeletal-muscle); no publication figure imagery is copied. These microstructures are illustrative and are not registered to the BodyParts3D donor.

The sarcomere lattice is also original MIT geometry, informed by the qualitative sliding-filament description in OpenStax section 10.3 (https://openstax.org/books/anatomy-and-physiology-2e/pages/10-3-muscle-fiber-contraction-and-relaxation). It uses disclosed representative dimensions and sparse illustrative myosin heads. It contains no measured protein coordinates or copied figures. Length-controlled sliding is not a force or biochemical model.

## Muscle excitation model

The optional fixed-length activation experiment adapts the fast-twitch mouse-muscle CellML model by Paul R. Shorten, Paul O'Callaghan, John B. Davidson and Tanya K. Soboleva (2007), distributed by the Physiome Model Repository under CC BY 3.0 (https://creativecommons.org/licenses/by/3.0/). Source exposure: https://models.physiomeproject.org/exposure/159ba2f081022ca651284404f39eeb40/shorten_ocallaghan_davidson_soboleva_2007.cellml/view, changeset `33944b1d8ee3227ebd32df9a7b1116c649632145`. C equations were mechanically translated to TypeScript; current input and SR-release interventions are described in `models/shorten2007/README.md`. Original CellML and generated C/Python source, author metadata and checksums are retained. This is not a human-calibrated model or physical force measurement.

## Reconstructed neck arteries

`models/reconstructed-vessels.json`, `reconstructed-vessels.bin` and `reconstructed-vessels.bin.gz` are original MIT geometry generated by `scripts/vessels/build-reconstructed-vessels.py`. They are not BodyParts3D meshes. Each of the four segments is a curve fitted between two BodyParts3D vessel ends to close a gap in the packaged atlas; no imaging was used.

## Calibre-adjusted vessels

`models/calibrated-vessels.json`, `calibrated-vessels.bin` and `calibrated-vessels.bin.gz` are BodyParts3D meshes whose vertices were moved radially about their own centerlines to a published adult calibre. They are derivatives of the BodyParts3D source and remain under its terms. The measurements they follow are cited in `models/vessel-calibre/ledger.json` in the repository.

## Blood molecules

`models/molecules/molecules.glb` holds 47 models of what blood contains: the 36 species the body model carries, three plasma proteins, five ions and three blood cells. Small-molecule coordinates are PubChem3D conformers from PubChem (National Center for Biotechnology Information, U.S. public domain data, https://www.ncbi.nlm.nih.gov/home/about/policies/). Peptide and protein coordinates are chains from the wwPDB archive via RCSB PDB, released under CC0 1.0 (https://www.rcsb.org/pages/usage-policy). The accession, chains, experimental method and download hash of every structure are in `assets/molecules/ledger.json` in the repository.

Meshes were generated from those coordinates with `scripts/molecules/build.py` in Blender and are original MIT geometry. LH and inhibin B have no deposited structure and are shown as human chorionic gonadotropin (PDB 1HCN) and activin A (PDB 2ARV), labelled as stand-ins. Blood cells and ions are generated from published dimensions (red cell profile: Evans and Fung, Microvascular Research 1972; ionic radii: Shannon, Acta Crystallographica A 1976; platelet and neutrophil sizes as cited in the ledger). Resting concentrations and cell counts used to draw true numbers are compiled, with every source and conversion, in `assets/molecules/blood-reference.json`; most come from the ABIM Laboratory Test Reference Ranges (January 2026).
