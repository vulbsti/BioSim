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
