# Published datasets: sources and what was kept

Compact extracts of openly licensed health datasets, for calibrating and testing the
simulation against real people. They were downloaded on 2026-11-12 from the original
publishers, without logins, credentialing or data use agreements. Total size is about 24 MB.

Each licence below is copied from the dataset's own page. Several are **attribution
licences**, and CGMacros is also **NonCommercial-ShareAlike**, so anything built from it
must credit the authors, stay non-commercial and carry the same licence.

The extract was built by a pandas script (run on uxserver, not committed) that reads the
raw downloads and writes this folder. The picks are deterministic. Rules are described
per dataset below.

---

## CGMacros 1.0.0 (`cgmacros/`)

- **URL:** https://physionet.org/content/cgmacros/1.0.0/
- **Version:** 1.0.0 (published 28 Jan 2025). Source file: `CGMacros_dateshifted365.zip`, with
  SHA-256 checked against PhysioNet's `SHA256SUMS.txt`.
- **Access:** Open Access on PhysioNet.
- **Licence:** Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International
  (CC BY-NC-SA 4.0). The full text is in `cgmacros/LICENSE.txt`. PhysioNet's file
  server returned this file empty, so it was recovered from PhysioNet's HTML view of
  the same file. It matches the published SHA-256 (`a2370e85…ca9f6`) byte for byte.
- **Citation:** Gutierrez-Osuna, R., Kerr, D., Mortazavi, B., & Das, A. (2025). CGMacros: a
  scientific dataset for personalized nutrition and diet monitoring (version 1.0.0).
  PhysioNet. https://doi.org/10.13026/3z8q-x658. Original publication: Das, A., Kerr, D., Glanz, N.,
  Bevier, W., Santiago, R., Gutierrez-Osuna, R., & Mortazavi, B. "CGMacros: a scientific
  dataset for personalized nutrition and diet monitoring," *Scientific Data* (under review at time of
  release). PhysioNet: Pollard, T. et al. (2026). PhysioNet as a global platform for
  biomedical research. *Nature Health*. https://doi.org/10.1038/s44360-026-00096-z
- **Kept:**
  - `bio.csv` for all 45 participants, unchanged (age, sex, BMI, HbA1c, fasting glucose,
    fasting insulin, lipids, fingerstick glucose).
  - `DataDictionary_Bio.csv`, `DataDictionary_CGMacros-00X.csv` and `LICENSE.txt`.
  - Per-minute CSVs (Libre and Dexcom glucose, HR, activity calories, METs, logged meals with
    macros) for 6 participants. They were grouped by `A1c PDL (Lab)` using ADA cut-offs
    (<5.7 healthy, 5.7–6.4 prediabetes, ≥6.5 type 2). In each group, the 2 with the most
    logged meals (then the most Libre readings) were kept:

    | file | group | HbA1c % | fasting glucose mg/dL | age / sex |
    |---|---|---|---|---|
    | CGMacros-004.csv | healthy | 5.5 | 105 | 33 F |
    | CGMacros-031.csv | healthy | 5.1 | 102 | 46 F |
    | CGMacros-041.csv | prediabetes | 6.3 | 138 | 58 F |
    | CGMacros-043.csv | prediabetes | 6.0 | 96 | 45 F |
    | CGMacros-005.csv | type 2 | 6.6 | 144 | 51 F |
    | CGMacros-014.csv | type 2 | 7.1 | 147 | 53 M |

  - The `Image path` column was dropped from these CSVs because the meal photos (3,454
    images, about 650 MB) were not kept. Dates are PhysioNet's date-shifted values.
- **Left out:** meal photos, `gut_health_test.csv`, `microbes.csv`, the microbiome
  dictionaries, `DataDictionary.pdf`, and the other 39 participants' CSVs.

## BIG IDEAs Lab Glycemic Variability and Wearable Device Data 1.1.3 (`big_ideas/`)

- **URL:** https://physionet.org/content/big-ideas-glycemic-wearable/1.1.3/
- **Version:** 1.1.3 (latest, published 13 Apr 2026). SHA-256 checked for every file
  downloaded.
- **Access:** Open Access on PhysioNet.
- **Licence:** Open Data Commons Attribution License v1.0 (ODC-By 1.0). The full text is in
  `big_ideas/LICENSE.txt`.
- **Citation:** Cho, P., Kim, J., Bent, B., & Dunn, J. (2026). BIG IDEAs Lab Glycemic
  Variability and Wearable Device Data (version 1.1.3). PhysioNet.
  https://doi.org/10.13026/aw6y-fc44. Original publication: Bent, B., Cho, P. J., Henriquez, M.,
  Wittmann, A., Thacker, C., Feinglos, M., Crowley, M. J., & Dunn, J. P. (2021). Engineering
  digital biomarkers of interstitial glucose from noninvasive smartwatches. *npj Digital
  Medicine*, 4, 89. https://doi.org/10.1038/s41746-021-00465-w. Also cite the PhysioNet
  platform paper above.
- **Kept:** `Demographics.csv` (all 16: ID, gender, HbA1c), `LICENSE.txt`, and for 2
  participants:
  - `001/` (female, HbA1c 5.5, normal) and `003/` (female, HbA1c 5.9, prediabetic range).
  - `Dexcom_<id>.csv`: the full Dexcom G6 export (5-minute interstitial glucose), unchanged.
  - `Food_Log_<id>.csv`: the full food log, unchanged.
  - `HR_<id>_first3days.csv`: Empatica E4 heart rate, cut to the first 3 days of recording
    (001: 13 Feb 2020 15:29 to 16 Feb 15:28, 165,958 of 634,188 rows; 003: 22 Feb 2020
    18:09 to 24 Feb 22:35, 153,415 of 417,289 rows. 003's recording has gaps).
- **Left out:** ACC, BVP, EDA, IBI and TEMP (up to 1.4 GB per file per participant), and
  participants 002 and 004–016.

## Fitabase Fitbit data, Furberg et al. (`fitabase/`)

- **URL:** https://zenodo.org/records/53894
- **Version:** Zenodo record 53894, "Crowd-sourced Fitbit datasets 03.12.2016-05.12.2016"
  (published 31 May 2016). Export used: `mturkfitbit_export_4.12.16-5.12.16.zip`.
- **Access:** open, no login.
- **Licence:** Creative Commons Attribution 4.0 International (CC BY 4.0).
- **Citation:** Furberg, R., Brinton, J., Keating, M., & Ortiz, A. (2016). Crowd-sourced
  Fitbit datasets 03.12.2016-05.12.2016 [Data set]. Zenodo.
  https://doi.org/10.5281/zenodo.53894
- **Kept:** the 3 users with the most heart rate minutes. Their ids and heart rate minutes
  are 6962181067 (41,490), 5553957443 (40,100) and 4388161847 (38,109).
  - `heartrate_minute_derived.csv`: **derived**. This export has no per-minute heart rate
    file, only `heartrate_seconds_merged.csv` (a sample every few seconds, 89 MB). The samples
    were averaged per clock minute. Columns are `Id, ActivityMinute, HeartRateMean, Samples`.
  - `minuteStepsNarrow_merged.csv`, `minuteSleep_merged.csv`, `sleepDay_merged.csv` and
    `dailyActivity_merged.csv`, filtered to those 3 users. The rows are otherwise unchanged.
- **Left out:** the raw seconds heart rate, other minute/hourly/daily files (calories, METs,
  intensities, weight log), the other users, and the earlier 3.12.16–4.11.16 export.

## NHANES 2017–2018 laboratory data (`nhanes_2017_2018/`)

- **URL:** https://wwwn.cdc.gov/Nchs/Nhanes/2017-2018/. The files were downloaded from
  `https://wwwn.cdc.gov/Nchs/Data/Nhanes/Public/2017/DataFiles/<FILE>.XPT`.
- **Version:** 2017–2018 cycle files DEMO_J, GLU_J, INS_J, GHB_J, TRIGLY_J, HDL_J, TCHOL_J,
  BIOPRO_J, CBC_J, FERTIN_J and HSCRP_J, as served on 2026-11-12.
- **Licence:** public domain (US government work, CDC/NCHS). NCHS asks to be acknowledged
  as the source.
- **Citation:** Centers for Disease Control and Prevention (CDC), National Center for Health
  Statistics (NCHS). National Health and Nutrition Examination Survey Data, 2017–2018.
  Hyattsville, MD: US Department of Health and Human Services, CDC.
- **Kept:** `nhanes_2017_2018_fasting_adults_300.csv`, 300 adults sampled at random
  (pandas `sample`, `random_state=20171018`). They come from the 2,485 participants aged 18
  or over who have both fasting plasma glucose and fasting insulin. Columns and their
  source variables:

  | column | NHANES variable (file) |
  |---|---|
  | SEQN | SEQN (respondent id, all files) |
  | age_years | RIDAGEYR (DEMO_J), top-coded at 80 |
  | sex | RIAGENDR (DEMO_J), 1 = male, 2 = female |
  | glucose_mg_dl | LBXGLU, fasting plasma glucose (GLU_J) |
  | insulin_uU_ml | LBXIN, fasting insulin µU/mL (INS_J) |
  | hba1c_pct | LBXGH, glycohemoglobin % (GHB_J) |
  | triglycerides_mg_dl | LBXTR (TRIGLY_J) |
  | hdl_mg_dl | LBDHDD, direct HDL (HDL_J) |
  | total_cholesterol_mg_dl | LBXTC (TCHOL_J) |
  | alt_u_l | LBXSATSI, ALT U/L (BIOPRO_J) |
  | ast_u_l | LBXSASSI, AST U/L (BIOPRO_J) |
  | creatinine_mg_dl | LBXSCR, serum creatinine (BIOPRO_J) |
  | haemoglobin_g_dl | LBXHGB (CBC_J) |
  | ferritin_ng_ml | LBXFER (FERTIN_J) |
  | hs_crp_mg_l | LBXHSCRP (HSCRP_J) |

  Triglycerides, HDL and total cholesterol are missing for 1 of the 300. All other columns
  are complete. This is an unweighted sample, so it is **not** nationally representative.
  Use the fasting subsample weights (WTSAF2YR in GLU_J) from the full files for population
  estimates.
- **Left out:** the full XPT files and their CSV conversions (kept on uxserver under
  `work/datasets/nhanes/`), and all other variables.

## Shanghai T1DM and T2DM CGM datasets, Zhao et al. 2023 (`shanghai_t1dm_t2dm/`)

- **URL:** https://doi.org/10.6084/m9.figshare.21600933.v5 (figshare item 21600933, "diabetes_datasets.zip",
  version 5, 2023-10-30). This is the latest version. It adds 188 CGM readings to two T2DM
  files, per its `note.txt`. The earlier figshare item 20444397 v3 (also CC BY 4.0) was
  downloaded for comparison but not used.
- **Access:** open, no login.
- **Licence:** Creative Commons Attribution 4.0 International (CC BY 4.0), as stated on the
  figshare item.
- **Citation:** Zhao, Q., Zhu, J., Shen, X., Lin, C., Zhang, Y., Liang, Y., Cao, B., Li, J.,
  Liu, X., Rao, W., & Wang, C. (2023). Chinese diabetes datasets for data-driven machine
  learning. *Scientific Data*, 10, 35. https://doi.org/10.1038/s41597-023-01940-7. Dataset:
  Zhao, Q., Zhu, J., Wang, C., & Rao, W. (2022). diabetes_datasets.zip. figshare.
  https://doi.org/10.6084/m9.figshare.21600933.v5
- **Kept:** 3 patients per type, using each patient's first recording period (`_0_` file).
  The patients chosen were those with the most CGM readings (14 days at 15-minute intervals).
  Each Excel sheet was converted to CSV, UTF-8 with all columns: CGM, capillary glucose,
  ketone, diet text in English and Chinese, and insulin and other drug doses.
  - T1DM: `1003_0_20210831`, `1012_0_20210923` and `1007_0_20210726`.
  - T2DM: `2000_0_20201230`, `2015_0_20210203` and `2016_0_20201224`.
  - `T1DM_summary_selected.csv` and `T2DM_summary_selected.csv` hold those patients' rows from
    `Shanghai_T*DM_Summary.xlsx` (demographics, complications, drugs, fasting and 2-hour glucose,
    C-peptide, insulin, HbA1c, lipids, renal markers).
- **Left out:** the other 10 T1DM and 97 T2DM recordings, later periods for the chosen
  patients, and the authors' `data_analysis.ipynb`.

---

## Skipped

None of the requested datasets needed a login, credentialing or a data use agreement, so
none were skipped for access reasons.
