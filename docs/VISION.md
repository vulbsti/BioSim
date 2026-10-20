# BioSim reset: review, vision, plan and verification

20 October 2026. Reviewed against `simulate` at 032b4de (PR 8 merged). The local knee-jerk commit 50838d3 is not on GitHub and was judged from your screenshots only.

---

## 1. The short answer: why it feels like slop

You are right. The reasons are concrete, and five of them explain almost everything.

1. **There is no "you" in it.** Nothing accepts a blood test, a CGM trace, a fitness band export, EEG or a microbiome report. The only inputs are a hand-typed meal, gas and temperature sliders, and six "senses" sliders (light, sound, touch, pain, aroma, sleep). The body is an abstract reference adult, so nothing on screen can be about the person looking at it.
2. **Most of the screen is the engine's debugger, not the body.** About 60% of the visible UI is engineering scaffolding: conservation residuals ("Water residual 1.1e-10 mL"), a compartment table, a log of your own clicks, an update-rule equation, a vessel-mesh audit. These were built so the code could prove its bookkeeping. A person cannot read them, and none of them touch the 3D body.
3. **The hormones are numbers that do not move.** All 31 hormones are one body-wide number each ("1.01×" of an invented baseline). At rest they sit at about 1.0. Thirteen of them (the whole reproductive axis, CRH, ACTH, TRH, TSH, GH, IGF-1, ghrelin, melatonin) affect nothing else in the model. So the Hormones tab is a wall of 1.0s.
4. **Zooming in cannot show a hormone, by construction.** The vessel "Dive" draws molecules at their true count. Insulin is about one molecule per 3 µm cube of blood, and a molecule is only drawn once it is 6 pixels wide, which needs a view under 0.7 µm across. Expected insulin molecules on screen at that zoom: about 0.01. Epinephrine: 0.0002. The dive is physically honest and therefore useless for showing hormone action. The hormone colour lens is a static tint on a few glands with a minimum strength, so it looks the same at rest and after a meal.
5. **Islands that look connected but are not.** There are four separate apps behind the main one (molecular lab, tissue explorer, circulation pilot, 3D atlas), two blood networks, two insulin models, two muscle glucose paths, and a brain "map" that is a flat node diagram whose flows are just the body's brain share redistributed by invented resistances. The atlas has no spinal cord and no peripheral nerves, so the "Nerves" view promised things that did not exist, and the knee reflex nerves were drawn from landmarks on top of the body.

What is genuinely good and worth keeping: the 3D body itself, the substance colour lenses (glucose, oxygen and so on, which really follow the simulation), the "This meal" tracer, the heart chambers and valves (driven by a real four-chamber solver), breathing and gut motion scaled by the model, blood beads that follow organ flows, and the mass-conserving transport core underneath.

---

## 2. What those tabs actually were

You asked what Hormones, Transport and Event ledger do. Plainly:

| Tab or panel | What it really is | Verdict |
|---|---|---|
| **Hormones** | 31 cards, each a number "× baseline". Clicking one shows its secretion and clearance rate and the equation `dH/dt = secretion − H/τ`. Values are relative activities invented for the model, not lab concentrations. | Delete. Hormones come back as things you see moving on the body (section 5.4). |
| **Transport** | A table of the 23 internal pools (arterial blood, portal blood, liver tissue, ...) with grams and mg/dL of one substance, plus a mass-balance residual. It is the engine's accounting sheet. | Delete. The same numbers already colour the body through the lenses. |
| **Event ledger** | A timestamped list of the buttons you pressed ("Custom meal at 00:12"). | Delete. |
| **Brain vessels** | A flat Circle of Willis diagram: 34 nodes, 55 vessels, pressures from a resistance network with made-up resistances, scaled to whatever brain flow the body already chose. Plus a "source vessel coverage" audit of mesh names. | Delete. Replaced by a real 3D brain (section 5.3). |
| Experimental physical meal pathway | A developer switch for an insulin transport plus receptor-signalling chain (Sedaghat model, GLUT4), with "Sensitivity: Off · legacy behaviour" and "Refine 1% as radial shells". Off by default. | Delete. |
| Fork a comparison | Copies the body at this moment and runs the copy without your later inputs, drawn as a dashed line on the chart. | Delete. |
| Apply input now / in 5 min / 15 / 60, Upcoming inputs | A scheduling queue for inputs. Meaningless once inputs are your real data. | Delete. |
| Senses tab | Light, sound, touch, pain, aroma, sleep sliders. The note under it admits perception is not simulated. | Delete. |
| Transport accounting badge, model dialog residuals, footer "0.3 experimental pathway" | Proof that the bookkeeping balances. Reads as fake reassurance to a user. | Delete. |
| Load run / Export run | Save and reload the engine's JSON. Developer feature. | Delete for now. |
| Live organ readouts under the body | Ten buttons, each with one number, the hormone ones invented ("CCK 1.10×"). | Delete; the selected-organ card replaces them. |
| Molecular lab, Explore tissue in 3D, Trace hormone circulation, 3D anatomy (separate pages) | Separate apps: receptor binding sliders, a sarcomere explorer, a 10-compartment insulin circuit, and the old atlas viewer. None of them read your body's state except the tissue page in a narrow way. | Delete all four. Zooming into tissue returns later inside the body view. |

---

## 3. What I deleted and what I kept (draft PR, nothing merged)

Branch `claude/project-thread-iyxw9i`, draft PR against `simulate`. See section 8 for how to look at it.

**Deleted**
- Pages: molecular lab, tissue explorer, circulation pilot, separate atlas page (`app/molecular`, `app/tissue`, `app/circulation`, `app/page.tsx`, `app/scene.tsx`).
- Panels: Brain vessels, Hormones, Transport, Event ledger, the senses tab, experimental pathway, fork, schedule queue, residual badges, export and load.
- Engine islands: the opt-in meal pathway (`multiscale-meal.ts`), the placeholder beta cell, Sedaghat signalling, the 34-node brain solver, the generic chemical kernel (`core/`), recording import and export.
- Repo weight: the docs for the old multiscale plan and pilots, `validation/` (12 MB of receipts), pilot scripts and tests, unused UI components and npm packages.

**Kept**
- The 3D body and everything on it that follows the simulation (lenses, meal tracer, meal route, heart, breathing, gut, bladder, blood beads, vessel dive).
- The transport and physiology engine, timeline look-back, and three plain starting situations: after a meal, exercise and recovery, drinking water.
- The body is now the whole screen. Controls float over it: a top bar with the vital signs and play controls, a small "Try something" panel on the left, a plain-language card for whichever organ you click on the right, and a chart you can open at the bottom. A full-screen button hides the browser chrome too.

Hormones are still computed by the engine for now, because insulin, glucagon, cortisol, adrenaline, ADH and aldosterone drive real things in it. Pruning the 13 dead ones is step 1 of the plan.

---

## 4. The vision

**One sentence:** you put in what you can measure about yourself, and you watch a living, rough picture of what that probably means inside you: what is flowing where, which organs are working, and how one thing leads to another.

### 4.1 The experience, as a story

Asha has a blood test PDF, a Libre CGM, and an Oura ring.

1. **She brings her data.** She drops in her Libre CSV and her Oura export, and types eight numbers from the blood test (fasting glucose, HbA1c, fasting insulin, triglycerides, HDL, LDL, TSH, CRP). The app shows which organs each number speaks to and which ones are missing.
2. **She sees her body at rest, as hers.** The body fills the screen. Her liver and muscles are tinted against a typical body: her fasting insulin is high for her glucose, so the muscles are drawn as "slow to take up sugar". A small badge on each tint says where it came from ("from your HbA1c and fasting insulin").
3. **She replays a real day.** A scrubber runs along the bottom: her actual day, 24 hours, from her CGM and ring. At 13:10 her CGM shows lunch. She presses play. Sugar dots leave the gut into the portal vein, the liver catches some, the pancreas pulses and gold insulin particles stream into the blood, the muscles and fat light up as they take sugar in. Her glucose curve rises and falls in sync with what she sees.
4. **She sees the links.** At 03:00 her ring shows short deep sleep and a high resting heart rate. The adrenal glands pulse, cortisol particles travel, the liver releases sugar, and her morning glucose is higher. A thin line from "short sleep" to "morning glucose" appears with one sentence of explanation.
5. **She zooms in where it matters.** She double-clicks the thigh: blood capillaries, muscle fibres, insulin docking, sugar crossing in, drawn exaggerated and labelled "not to scale".
6. **She asks "what if".** She drags a 20-minute walk after lunch onto the timeline and sees the muscles take more of the meal and the curve flatten. This is clearly marked as a what-if, not her data.
7. **The brain is its own view.** With a Muse headband export, the 3D brain's regions glow by band power: calm alpha over the back of the head while meditating, more beta over the front during work. Nerves leave the brainstem: the vagus runs down to the heart and gut and visibly slows the heart when her HRV is high.

### 4.2 Principles

1. **Every pixel answers "what is happening inside me?"** If a thing on screen does not, it goes.
2. **Data in, picture out.** Measurements set the state. Simulation fills the gaps between measurements and shows the mechanism. A pure what-if is labelled as such.
3. **Show flow, not tables.** Things move: blood, food, hormones, nerve signals. Numbers are secondary and appear on hover or in the organ card.
4. **Colour means "compared with you" or "compared with typical".** Never red and green alarms, never a diagnosis.
5. **Every visual is traceable.** Any glow, particle or speed can say which input drove it and which mechanism carried it.
6. **Honest exaggeration.** Hormone particles are shown far denser than reality so they can be seen, with a "not to scale" label. Accuracy of direction and timing matters more than absolute numbers.
7. **Anatomy sits inside the body.** New structures (nerves, cord) are registered to the atlas skeleton and tissue, never floated on top.
8. **Few things, done well.** Better five organs that clearly react than thirty-one hormones that sit at 1.0.

---

## 5. What it takes to build

### 5.1 The pieces

```
Your data ─► Normaliser ─► Personal baseline ─► Body model ─► Visual bindings ─► 3D body + brain
(CSV, PDF,     (units,        (sets parameters     (lumped,       (each state      (one screen,
 typed)         LOINC)         and starting state)  per-organ)     drives a visual)  a timeline)
                                                        ▲
                                                 what-if events
```

1. **Data in.** File parsers plus a short manual form. All on the device, nothing uploaded.
2. **Personal baseline.** Turns measurements into model parameters (for example HbA1c + fasting insulin into insulin sensitivity, resting HR + HRV into autonomic tone, VO₂max into heart capacity).
3. **Body model.** The existing transport engine, slimmed, with a small set of linked organ models. Must run a 24 h day in a few seconds in the browser.
4. **Visual bindings.** A table: model variable → what changes on screen. Every row has a check (section 6).
5. **One screen.** The full-screen body, a brain view, a day timeline, an organ card.

### 5.2 Inputs: what each measurement drives

Ordered by value and by how ready the engine is.

| Input | Format | Sets in the model | What you see |
|---|---|---|---|
| **CGM** (Libre, Dexcom) | CSV, 5 or 15 min glucose | Blood glucose over the day, meal times and sizes inferred from rises | Sugar flowing gut → liver → blood → muscle and fat; the day replays |
| **Blood panel** | Typed values or FHIR/LOINC; PDF later | Fasting glucose, HbA1c, insulin → insulin sensitivity and beta-cell response. Lipids → fat in blood. TSH/T4 → metabolic rate. CRP → inflammation. Creatinine/eGFR → kidney clearance. ALT/AST → liver load. Hb/ferritin → oxygen carrying | Organ tints with "why" badges; liver, pancreas, kidneys, thyroid react |
| **Fitness band** (Apple Health, Oura, Fitbit, Garmin, Whoop) | XML/CSV/JSON | Heart rate, HRV → sympathetic vs parasympathetic. Steps, workouts → muscle demand. Sleep stages → cortisol timing, growth hormone. SpO₂, breathing rate → lungs | Heart speed, vagus activity, muscles working, cortisol at dawn |
| **Body composition** (DEXA, smart scale) | Typed | Fat and lean mass, visceral fat | Fat depots, muscle mass |
| **EEG** (Muse, OpenBCI, Emotiv) | CSV of band power per electrode | Brain region activation by band | 3D brain regions glow |
| **Gut microbiome** (16S reports) | Typed key values or TSV | Diversity, fibre fermenters → short-chain fatty acids, gut barrier | Gut lining, SCFA flow to liver and brain via vagus. Mostly qualitative |
| Watch ECG | CSV, 30 s | Rhythm and heart rate | Conduction path animation driven by the real rhythm |

### 5.3 A real 3D brain

The atlas already has about 140 head meshes: frontal, parietal, temporal gyri, occipital lobe, cingulate, insula, hippocampus, amygdala, thalamus, hypothalamus, caudate, putamen, pallidum, midbrain, pons, medulla, cerebellum, pituitary, pineal, ventricles and cerebral vessels. That is enough for a standalone brain view with about 15 named functional regions (movement, touch, vision, hearing and language, planning, memory, emotion, hormones control, autonomic control, balance, ...).

What it lacks: the spinal cord, almost all cranial nerves (it has only the eye nerves), and every peripheral nerve. Those must come from a source that has them:
- **Z-Anatomy** (CC BY-SA 4.0) has the cord, all cranial nerves and the main peripheral nerves in the same body style. The share-alike licence is the same open question as the external carotids.
- Otherwise, author them as centrelines registered inside the vertebral canal and along muscle and bone landmarks, checked against tissue so nothing leaves the body.

For EEG: standard 10-20 electrode positions (from MNE's montage) are mapped once onto the brain surface; band power is spread across nearby regions.

### 5.4 Hormones you can see

Replace "one number per hormone" with a short list of hormones that matter for these inputs: insulin, glucagon, cortisol, adrenaline, thyroid hormone, leptin, GLP-1, ADH, aldosterone, melatonin. For each:
1. **The gland pulses** when it secretes (pancreas, adrenals, thyroid, pituitary, gut wall).
2. **Coloured particles leave** into the nearest vein and travel with the blood beads, at a density exaggerated about a million times and labelled so.
3. **Targets light up** when particles arrive (muscle and fat for insulin, liver for glucagon and cortisol, heart for adrenaline, kidneys for ADH).
4. Insulin gets real per-compartment values (portal blood higher than arterial), which the engine half-has already.

### 5.5 Build order

Each step ends with something you can see and check on the dev server.

| Step | What | You see |
|---|---|---|
| 0 (this PR) | Delete the noise, full-screen body | One clean screen |
| 1 | Prune the engine to the hormones and organs that link to inputs; make insulin, glucagon, cortisol, adrenaline drive things strongly enough to see | After a meal, the body visibly changes; at rest it is calm |
| 2 | Hormones as particles (5.4) | Pancreas pulses, gold insulin flows, muscles light up |
| 3 | CGM import and day replay | Your real glucose curve drives the body over 24 h |
| 4 | Blood panel and personal baseline | Your organs tinted vs typical, with "why" badges |
| 5 | Fitness band import (HR, HRV, sleep, steps) | Heart speed, vagus, cortisol at dawn, muscles walking |
| 6 | 3D brain view from atlas meshes, regions named in plain words | A real brain, clickable regions |
| 7 | Cord, vagus and cranial nerves registered inside the body | Nerves that sit inside, visibly carry signals |
| 8 | EEG band power on the brain | Regions glow from your headband data |
| 9 | Microbiome to gut and vagus | Gut lining, fermentation, gut-brain link |
| 10 | What-ifs on the timeline (a walk, a later dinner, more sleep) | Before and after, side by side |

---

## 6. Verification system

Two gates. Every change must pass both before it merges. They are run by whoever builds the change and shown to you as a short page with screenshots and pass or fail for each check.

### 6.A Does it work as intended? (visual and mechanism, not code checks)

**A1. Cause → visible effect cards.** Each mechanism gets a card written before it is built:

> *Cause:* a 75 g carbohydrate meal at 12:00.
> *Expected on screen:* sugar dots leave the gut within 10 min; portal vein glows before the arteries; pancreas pulses within 5 min of glucose rising; muscle and liver tint rises; glucose curve peaks 30 to 60 min after, back near baseline by 2 to 3 h.
> *Evidence:* screenshots at 0, 15, 45, 120 min, plus the curve.

The check passes only if a person looking at the four screenshots, without reading numbers, can say what happened in the right order. Screenshots are taken by a browser script on uxserver so they repeat exactly.

**A2. Rest is quiet, change is loud.** For every visual, a pair of screenshots: at rest, and under the strongest normal input. If the two look the same to the eye, the visual is decoration and fails. (This would have failed the hormone lens and the conduction glow.)

**A3. Direction of mechanism.** A short table of things physiology agrees on, checked against the model with the user's style of inputs:
- glucose up → insulin up → glucose back down;
- exercise → heart rate up, muscle flow up, glucose uptake up;
- short sleep → morning cortisol higher → morning glucose a bit higher;
- high HRV → lower resting heart rate;
- big water drink → ADH down → more urine;
- low SpO₂ → faster breathing.
Each row passes if the sign and rough timing are right. Exact numbers are not the bar.

**A4. Data round trip.** For each importer, a real export file goes in and the replay must reproduce the measured curve (for CGM, the drawn glucose follows the measured one within a stated margin at every point). If the model cannot follow the measurement, the measurement wins and the gap is shown.

**A5. Anatomy sits inside.** Any new mesh (nerve, cord, region) is tested for containment: no vertex outside the skin, nerves inside the canal or between muscles, checked automatically against the atlas and by screenshots from four angles.

**A6. The five-second test.** Before merge, one non-medical person (or you, pretending) gets the screen for five seconds after a scenario and says what happened. If they cannot, the visual is not done.

### 6.B Does it serve the goal? (the anti-bloat gate)

Every feature, panel, label or file must answer yes to all of these, written in the PR:

1. **Which measured input does it use, or which inside-the-body question does it answer?** "None" means it does not ship.
2. **Can a non-medical person understand it without the docs?** Jargon labels fail.
3. **Does it show on the body or brain?** A number with no visual home goes into the organ card or nowhere.
4. **Does it change visibly when its input changes?** (A2.)
5. **Does it duplicate something already on screen?** If yes, merge or drop.
6. **What does it cost?** Lines of code, megabytes downloaded, controls on screen.

Standing budgets, checked on every PR:
- **One screen.** No new pages or tabs. New things live on the body, in the brain view, on the timeline or in the organ card.
- **At most about ten controls visible** at once on the main screen.
- **No developer tooling in the product UI** (residuals, ledgers, exports, solver switches).
- **Every PR lists what it deleted.** A PR that adds a feature should look for one to remove.
- **Docs are short and current.** One README, this vision, one model note. Old plans are deleted, not archived; git keeps history.

---

## 7. Decisions for you

1. **Which data first.** My default: CGM + blood panel + fitness band (steps 3 to 5) before EEG and microbiome, because the engine can already carry glucose, insulin and the heart, and these are the inputs most people have.
2. **Nerves and cord source.** My default: build the brain view from the atlas meshes now (step 6), and use Z-Anatomy for cord and nerves if CC BY-SA is acceptable to you. Otherwise I author registered centrelines, which is slower.
3. **The knee-jerk reflex commit** (50838d3, only on your machine). My default: drop it. It used nerves placed from landmarks, which you rejected, and the atlas has no peripheral nerves to rebuild it on. It comes back after step 7 if wanted.

---

## 8. How to look at the cleanup

The draft PR's branch is put on the uxserver dev server: http://192.168.88.8:3016. Nothing is merged into `simulate` until you say so.
