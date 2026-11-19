# BioSim vision and verification gates

> **Direction changed on 2026-11-19.** BioSim is becoming the *visualiser*: it draws a validated "body state" document (written by a separate analyser, not in this repo) on the 3D body, with dials. Sections 4 and 5 below describe the October plan (measurements in, simulation out) and are kept until the visualiser spec replaces them. Section 6, the verification gates, still applies to every change.

The October review that led to this plan (why the old app felt like slop, what was deleted in PR #9, the decisions it asked for) is in git history; those decisions have been made.

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
