# M1 human validation datasets — candidate review (2026-09-29)

Full record: [`validation/p4/m1-validation-protocol.json`](../validation/p4/m1-validation-protocol.json). This is candidate selection and metric locking only — no data is admitted, no model has run, no numeric bound is set. Governing rules: [P4 endpoint protocol](../validation/p4/human-endpoint-protocol.json), [P4 implementation notes](P4_IMPLEMENTATION.md), [execution plan §9](MULTISCALE_EXECUTION_PLAN.md#9-verification-and-biological-validation).

## Ranked candidates

| Rank | Candidate | Population | Timepoints | Individual data | License | Status |
|---|---|---|---|---|---|---|
| 1 | **Hall et al. 2018, "Glucotypes"** ([DOI](https://doi.org/10.1371/journal.pbio.2005143)) | n=57 (38 normoglycemic by standard criteria; 16 of those discordant on CGM) | 75 g OGTT at 0/30/120 min, glucose+insulin+C-peptide | Yes — S5 (SQLite) + S8 (TSV) supplementary files, verified only via the Supporting Information listing, not opened | CC BY 4.0 | Not admitted — files unopened; only 3 timepoints, so 60/90-min and full iAUC shape are unsupported |
| 2 | **NHANES OGTT public-use files** ([2015-16 cycle](https://wwwn.cdc.gov/Nchs/Data/Nhanes/Public/2015/DataFiles/OGTT_I.htm)) | ~2,084/cycle, general population (NGT subset must be derived) | 75 g OGTT, **0 and 120 min only** | Yes, individual, linkable by SEQN | US federal public-use, no restriction found | Not admitted — 2-hr insulin not confirmed present; only 2 timepoints |
| 3 | **Goodyear et al. 1996** (carried forward, [PubMed](https://pubmed.ncbi.nlm.nih.gov/8690151/)) | n=6 | 75 g glucose, 0/60 min muscle biopsy | Unknown — publisher PDF returned HTTP 403 on inspection | Unconfirmed | Not admitted (unchanged from 2026-09-22 review) — muscle membrane-GLUT4 candidate |
| 4 | **Kelley et al. 1988** (carried forward, [JCI](https://www.jci.org/articles/view/113489)) | n=9 | 1 g/kg oral glucose, 5-hr forearm balance | No — group summary only (mean ± SE), confirmed by re-fetch today | Not stated | Not admitted — systemic/muscle tracer-disposal candidate |
| — | **Dalla Man/Basu/Rizza triple-tracer cohort** (e.g. underlying [Dalla Man 2007](https://pubmed.ncbi.nlm.nih.gov/17946394/)) | ~204 subjects across related papers | Triple-tracer mixed meal | No public raw dataset located | N/A | **Excluded** — high independence risk: this cohort calibrates the Dalla Man meal-glucose model; cannot double as held-out data if this simulator's secretion module ever adopts Dalla Man kinetics |
| — | Zenodo lipodystrophy OGTT dataset ([10.5281/zenodo.22944731](https://zenodo.org/records/22944731)) | Partial lipodystrophy patients | OGTT glucose+insulin | Summary table only (.docx) | CC BY 4.0 | Excluded — disease population, not NGT; not raw timepoint data |
| — | PhysioNet BIG IDEAS Glycemic/Wearable v1.1.2 | n=16, elevated-normal/prediabetic A1c | None — OGTT files were corrupted and not collected | CGM only, no insulin/C-peptide | Open Data Commons Attribution v1.0 | Excluded — no OGTT, no insulin |

## Proposed calibration / held-out split

**Blocked.** No dataset above has been downloaded, checksummed, or had its exact fields verified — a split cannot be finalized before real admission (execution plan §9.1). Provisionally, since no human data have ever been fitted into this simulator's secretion/transport/signaling modules, every admitted dataset would sit in the **held-out** set with **none** used for calibration. This must be re-confirmed once the secretion module's kinetic-model provenance (Dalla Man overlap risk) is resolved and once files are actually opened.

## Locked endpoints and metrics (form only, no numeric bounds)

- **Systemic glucose:** 0/30/60/90/120-min plasma glucose, glucose iAUC (0–120 min), time-to-peak, 2-hour glucose, return-to-basal — model observable is the arterial glucose compartment (plasma-basis, venous/arterial caveat declared), compared against the admitted dataset's own 10th–90th percentile band or SD-derived band.
- **Systemic insulin:** peak insulin, insulin iAUC (0–120 min), insulin/glucose iAUC ratio — model observable is the **post-hepatic peripheral/systemic** insulin compartment, explicitly *not* the raw portal secretion output, since every candidate dataset measures peripheral venous insulin.
- **Muscle-specific:** Goodyear 1996 mapped to the model's muscle-cell membrane-GLUT4 pool at 60 min as a within-donor post/basal log ratio; Kelley 1988 mapped to net muscle-tissue/blood glucose flux as a fraction of oral dose, compared at group level only.
- **Acceptance rule (locked form):** pass/fail band derived strictly from the admitted dataset's own reported variability (percentile band or SD), never from simulator numerical/conservation tolerances (e.g. the P1 1e-8 amount-ledger residual is explicitly forbidden as a biological bound).
- **Covariates/reference subject:** one adult male, 70 kg reference; age/BMI/sex required from any comparison dataset; no cross-population correction is authorized.
- **Failure handling:** every locked endpoint is evaluated once data and a model run exist, including failures, which are retained with their computed value and band rather than deleted or re-scoped.

## Key blockers

1. No dataset has been opened/downloaded/checksummed yet — top candidate (Hall 2018) needs its S5/S8 supplementary files actually pulled.
2. Hall 2018 and NHANES both fall short of the desired 0/30/60/90/120-min glucose panel (3 and 2 timepoints respectively); iAUC/shape metrics will carry that restriction forward explicitly rather than being computed as if fully sampled.
3. Independence of any future secretion-module kinetics from the Dalla Man/Basu/Rizza calibration cohort is unresolved and must be checked before that cohort (if ever found publicly) could be used at all.
4. Goodyear 1996 and Kelley 1988 blockers are unchanged from the 2026-09-22 review (see [human-endpoint-protocol.json](../validation/p4/human-endpoint-protocol.json)).
5. No numeric acceptance band is set anywhere in this document; all `numericBand` fields are `null` and explicitly `not_locked_pending_admitted_data`.
