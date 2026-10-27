# Body model

A lumped, mass-conserving model of an adult body, built to drive what the 3D body shows. It aims for the right direction and timing of changes, not laboratory precision. Numerical tests are not biological validation.

## What one step does

The model advances in fixed one-second steps (rates inside are per minute), in a Web Worker.

```
inputs (exercise, sleep, stress, air, temperature) and meals
  → stomach (a quarter hour of churning, then emptying) → intestine → portal blood / lymph
  → hormones: glands release into their own vein, blood carries them, every compartment clears them
  → heart rate, stroke volume, blood pressure, flow to each organ, breathing and gas exchange
  → blood and tissue transport of glucose, amino acids, fat, oxygen and CO₂
  → liver and muscle glycogen, fat stores, oxidation limited by oxygen and fuel
  → kidneys, water between plasma, interstitium and cells, heat
  → 30-second samples for the chart
```

Simulated time 0 is 08:00 (`CLOCK_START_HOUR`), so a run has a time of day: cortisol peaks in the morning and melatonin rises in the dark hours.

## Compartments

Thirteen blood compartments (arterial, venous, pulmonary, portal and nine organ beds: heart, brain, liver, gut, kidneys, muscle, skin, fat, other) hold 5 L at rest; nine tissue compartments hold 11 L of interstitial fluid. Blood moves between them with the organ flows; each bed exchanges with its tissue across a finite permeability. Water, carbohydrate, protein, fat, oxygen and CO₂ each balance exactly; the tests check the residuals.

## Hormones

Nine hormones, the ones a person's measurements can speak to and that drive something in the model:

| Hormone | Gland, and the vein it enters | Raised by | Does in the model |
|---|---|---|---|
| Insulin | Pancreas, portal | Blood sugar, GLP-1 | Muscle stores sugar as glycogen, liver stores sugar, fat release held back |
| Glucagon | Pancreas, portal | Low sugar, protein, stress | Liver breaks down glycogen |
| GLP-1 | Small intestine, portal | Food being absorbed | More insulin, slower stomach |
| Adrenaline | Adrenals, beside the renal veins | Stress, exercise, low sugar | Faster heart, liver releases sugar, more fat released |
| Cortisol | Adrenals | Morning rhythm, stress, low sugar | Liver makes new sugar from protein |
| Thyroid hormone | Thyroid, neck veins | Personal metabolic rate | Basal oxygen use and heart rate |
| ADH | Pituitary, head veins | Concentrated or low-volume blood | Kidneys keep water |
| Aldosterone | Adrenals | Low pressure or volume, stress (renin) | Kidneys keep salt |
| Melatonin | Pineal, head veins | Night, more when asleep | Shown only, for now |

Each hormone's level is relative: 1 is resting arterial blood. Every blood compartment carries its own level, so the portal vein holds about four times the arterial insulin at rest, as in people, because the liver removes about half on first pass. Glands' resting release is solved once per new body so that arterial blood starts at its steady level. Local gut signals (gastrin, secretin, CCK), sympathetic nerves (noradrenaline), renin and angiotensin, and ANP act through their drivers directly rather than as tracked hormones.

## Personal baseline

`createBody(params)` takes a `PersonalBaseline`, multipliers on a typical adult set from a person's data: insulin sensitivity, beta-cell response, metabolic rate, kidney clearance, oxygen carrying, resting heart rate (bpm) and autonomic tone (-1 vagal to +1 sympathetic). All default to typical.

## Known gaps

- A simulated 24-hour day takes tens of seconds to compute; day replay needs it to be a few seconds.
- Melatonin, thyroid hormone and aldosterone change little within a typical day; they matter once sleep, a blood panel or fluid data feed them.
- No ketones, lactate, acid-base or electrolytes beyond sodium. Muscle glycogen fills after meals and is burned in exercise; it is not released to blood.

## Checks

```sh
npm run check          # types
npm run test:physiology
npm run test:anatomy   # includes the hormone view gates: rest quiet, meal loud
npm run test:browser
```
