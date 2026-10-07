# Dalla Man 2007 beta-cell secretion subsystem (structure-reproduced, engineering parameters)

This is a pinned scientific fixture for Human Atlas B3, not a calibrated human-muscle or whole-body model, and **not a full numeric reproduction of a published table**. Read this before trusting a number from it.

## What this is

The beta-cell insulin secretion subsystem of the meal-simulation model in Dalla Man C, Rizza RA, Cobelli C. *Meal simulation model of the glucose-insulin system.* IEEE Trans Biomed Eng. 2007;54(10):1740–1749 (doi:10.1109/TBME.2007.893506):

```
S(t)    = gamma * Ipo(t)
dIpo/dt = -gamma * Ipo(t) + Spo(t)
Spo(t)  = Y(t) + K * dG/dt + Sb   if dG/dt(t) > 0
        = Y(t) + Sb               otherwise
dY/dt   = -alpha * [Y(t) - beta * (G(t) - h)]   if (G(t) - h) >= -Sb/beta
        = -alpha * Y(t) - alpha * Sb            otherwise
```

with `h = Gb` (basal glucose), `G` in mg/dL, `S`/`Sb`/`Y`/`Spo` in pmol/kg/min, `Ipo` in pmol/kg, `dG/dt` in mg/dL/min. This same two-component "dynamic (rate-of-rise) plus static (level-above-threshold, delayed)" secretion mechanism is the one Breda, Cavaghan, Toffolo, Polonsky, Cobelli (*Diabetes* 2001;50(1):150–158) introduced as the oral C-peptide minimal model, and which Dalla Man 2007 carries into the meal simulator; it is also the mechanism described (without population numbers) in the two sources below.

## What is, and is not, verified

**Equation structure — verified**, against two sources actually read in this session:

- Dalla Man C, Raimondo DM, Rizza RA, Cobelli C. *GIM, Simulation Software of Meal Glucose–Insulin Model.* J Diabetes Sci Technol. 2007;1(3):323–330. Open access: <https://pmc.ncbi.nlm.nih.gov/articles/PMC2769591/> (accessed 2026-09-29). States the dynamic/static split in prose and gives the software's default normal-subject basal glucose (91.76 mg/dL), basal insulin (25.49 pmol/L) and body weight (78 kg).
- Cobelli C, Dalla Man C, Toffolo G, Basu R, Vella A, Rizza R. *The Oral Minimal Model Method.* Diabetes. 2014;63(4):1203–1213. Open access: <https://pmc.ncbi.nlm.nih.gov/articles/PMC4179313/> (accessed 2026-09-29). Gives the dynamic-responsivity/static-responsivity (K/beta) description verbatim (see `parameters.json` for the exact quoted sentence).

**Numeric constants (gamma, K, alpha, beta, Sb) — unverified.** The 2007 IEEE TBME paper's Table 1, where these are actually published for the population-average normal subject, could not be read in this session:

- The IEEE paper itself has **no open-access copy anywhere** — confirmed via the Unpaywall API (`is_oa: false`, checked 2026-09-29).
- The Breda 2001 paper (the closest verifiable ancestor of this submodel) is flagged open ("bronze") by Unpaywall with a direct PDF URL, but that URL returned a Cloudflare bot-verification challenge to both the fetch tool and a real browser navigation. Per this session's operating rules, bot/CAPTCHA detection is not to be bypassed, so it was not read.
- The BioModels curated SBML reproduction of the full 2007 model (`BIOMD0000000379`), which would likely carry curator-verified numeric values, could not be downloaded — every attempt from this environment (direct download, redirected mirror, browser) either returned an empty body after a redirect or timed out.
- A PhD thesis, two literature reviews, two patents, and several further arXiv papers were checked for a reprinted Table 1; none had it, or the source was blocked (403). Full list with URLs is in `parameters.json` under `sources`.

Every numeric constant in `parameters.json` is therefore recorded with `"status": "unverified"` and is an **internally self-consistent engineering placeholder**: chosen to carry the right units, to reproduce the qualitative first-phase/second-phase shape the read sources describe, and to keep basal secretion in the same order of magnitude as this repository's prior synthetic law (`35 pmol/min` basal at `app/simulation/multiscale-meal.ts`). They are not fitted to, and must not be cited as, the literature's values. `Gb = 91.76 mg/dL` is the one number marked `"status": "verified"`, because it is the GIM software's own stated default and was read directly.

## Scope, units, what is/isn't reproduced

- Only the beta-cell secretion subsystem (3 states: `S`, `Ipo`, `Y`) is reproduced here — not the glucose, insulin-action, or gut-absorption subsystems of the full 2007 meal model.
- Units: glucose in mg/dL, time in minutes internally (the TypeScript integrator accepts seconds and converts explicitly), secretion in pmol/kg/min (per declared body mass) and pmol/min (multiplied by body mass).
- Secretion is modeled **into the portal vein**, matching the source model's convention; hepatic first-pass extraction is not part of this subsystem and is handled elsewhere in this repository's circulation/liver pathway.
- **70 kg reference body mass is a declared assumption** of this package (see `parameters.json`), used only for the pmol/kg ↔ pmol conversion at the `app/simulation/multiscale-meal.ts` callsite. It is not the GIM software's own default subject (78 kg) and is not a fitted or verified value.
- This is a population-average "normal subject" structure, not a personalized or diabetic (impaired secretion) model, and it is not validated against any individual human dataset in this repository — it is a structural reproduction with declared-synthetic constants, exactly like this repository's E01 fixture and unlike the fully numerically-verified `models/sedaghat2002` package.
- No claim is made that the two branch conditions (`dG/dt > 0`, and the `Y` floor branch) were tested against the original paper's numerical behavior beyond the qualitative description in the two read sources; they are implemented as stated in the task brief and cross-checked for internal self-consistency (see the steady-state derivation in `parameters.json`).

## License / citation

Dalla Man C, Rizza RA, Cobelli C. "Meal simulation model of the glucose-insulin system." *IEEE Trans Biomed Eng.* 2007;54(10):1740–1749. doi:10.1109/TBME.2007.893506.

Dalla Man C, Raimondo DM, Rizza RA, Cobelli C. "GIM, Simulation Software of Meal Glucose–Insulin Model." *J Diabetes Sci Technol.* 2007;1(3):323–330. (Open access, PMC2769591.)

Breda E, Cavaghan MK, Toffolo G, Polonsky KS, Cobelli C. "Oral glucose tolerance test minimal model indexes of beta-cell function and insulin sensitivity." *Diabetes.* 2001;50(1):150–158.

Cobelli C, Dalla Man C, Toffolo G, Basu R, Vella A, Rizza R. "The Oral Minimal Model Method." *Diabetes.* 2014;63(4):1203–1213. (Open access, PMC4179313.)

No source paper PDF is distributed in this package (none was legally obtainable). `parameters.json` records every source actually read, every source attempted and blocked, and the exact wording quoted from each.

## Limitations (repeat, for emphasis)

This package reproduces a published model's **equation structure and units**, with **engineering-declared, unverified numeric constants**. Treat any concrete secretion number this produces as illustrative, not as a validated physiological prediction, and never present the constants in `parameters.json` as Dalla Man 2007's own fitted values.
