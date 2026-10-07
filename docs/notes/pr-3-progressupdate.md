# Progress note: neck arteries registered from imaging

Date: 2026-10-05. Requested as limit 1 of the approved plan: replace the smooth reconstructed neck segments with centerlines from one open neck CT, warped onto the atlas.

## What was done, in order

- Licence: Zenodo concept DOI 10.5281/zenodo.6802613 resolves to v3.0.0 (record 22688904), `cc-by-4.0`.
- The archive is one 37 GB zip. Zenodo honours range requests, so only `meta.csv` and the candidate subjects were fetched.
- Subject: six scans are labelled "ct angiography neck". `s0504` (63 F, 380 to 435 HU in the carotids, arch to skull, C1 to C7, no pathology) was the only one with arterial-phase enhancement, full coverage and no pathology. Rejected: `s1112` (vascular pathology), `s0527` and `s0379` (160 and 120 HU), `s0909` (unenhanced), `s0744` (stops at C5).
- Tools: TotalSegmentator and VMTK were not on uxserver. Both were installed into venvs under `~/projs/human_atlas/work/neck-ct/` (TotalSegmentator against the local CUDA torch wheels; VMTK from PyPI). Both TotalSegmentator tasks used are open models.
- Scan side: `extract-neck-scan.py`. The first vertebral lumen mask was one voxel wide and broke apart, so VMTK returned a third of the vessel; the mask is now built on a 0.5 mm resampling with a thin core along the path.
- Landmarks: the brief's list, with these outcomes. Vertebral centroids C1 to C7 (whole vertebra, on both sides) plus T1, T2 and the cricoid: used. Hyoid, thyroid cartilage, foramen magnum: used. Transverse foramen centres: taken as the vertebral artery's position at each vertebra's level, C3 to C5, because the atlas's bony foramina are not closed rings round its own artery. Carotid canal entry: computed on both sides, dropped by the outlier rule.
- Foramen magnum: a flat plane is never fully ringed by bone there, so the first rule found nothing. It is now the pinch of the widest bone-free route from the spinal canal into the cranium.
- Atlas side: `build-registered-vessels.py`. Thin-plate spline with leave-one-out choice of smoothing and an outlier rule at 12 mm.
- Clearance: the source vertebral tips sit 2.0 mm (left) and 0.5 mm (right) from bone with a 1.56 mm radius, so "pin exactly to the tip" and "0.5 mm wall clearance" cannot both hold. Resolved by joining the source centerline above the tip and narrowing the entry. The first easing pass oscillated in the right-hand passage; later passes now push without smoothing.
- Calibre: the ledger held only the portal vein. Four cited entries were added after reading the PubMed abstracts. A first candidate for the vertebral artery turned out to be an intracranial measurement and was not used.

## Verified

- All four segments built; none fell back.
- Brain flow still arrives through all four neck segments within 2% (existing test).
- Typecheck, all unit suites, 11 vessel tests, browser suite (37 of 38 in the full run; the one timeout passes alone).
- Before/after Cycles render inspected.

## Not done

- Not pushed. No PR opened.
- External carotids (out of scope).
- A second scan to see how much the course depends on the subject.
- Full-text check of the two calibre sources.
- The interface version string still says "reconstructed neck arteries".

## Coordination

- Another session was editing the `sim-driven-assets` checkout during this work. This work was moved to a separate worktree, `/home/vulbsti/proj/human_atlas-neck-registration`, and touches three files that session also had open changes in: `app/simulation/BodyMap.tsx`, `package.json` (one line each) and `models/vessel-calibre/ledger.json` (appended entries). `reconstructed-vessels.*` and its provenance file are unchanged.
- uxserver: scan, segmentations and venvs are in `~/projs/human_atlas/work/neck-ct/`; render inputs in `~/projs/human_atlas-neck/`.
