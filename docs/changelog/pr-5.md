# Follow one meal through the body

Branch `claude/project-thread-n3u9i3`, from `simulate` after PRs #1 to #4 merged.

Before: the glucose colour showed the level in each place. It could not tell a meal's glucose from what was already in the blood, so after a meal the whole body warmed slightly and nothing showed where the meal itself had gone.

After: *Colour by → This meal* follows the most recent meal. At ingestion only the stomach is lit. Over the next minutes the small intestine warms, then the portal vein and liver, then the arteries and the tissues they feed. Organ labels give the grams of the meal each holds, and a strip shows where the meal's carbohydrate, protein and fat are now: stomach, intestine, blood, tissues, stored, burned, excreted. A new meal takes over the mark.

How: the solver labels a meal's nutrients when it is eaten. Every existing transfer moves the label in proportion to the labelled share of its source, advection reads labels from the same old state as amounts, and blood and tissue exchange the label in both directions on its own gradient. Reserves and sinks outside the compartments (glycogen, fat and protein reserves, oxidation, urine) hold the label too, so it always sums to what was eaten.

## Changes

- `app/simulation/types.ts`, `transport.ts`: `MealMark` on the transport state; `markMeal`, `carryMark`, `markedTotal`; `transfer` takes the size of an outside source so the label leaves it in proportion.
- `app/simulation/engine.ts`: a meal sets the mark; gastric emptying, absorption, glycogen release and fat release carry it.
- `app/simulation/recording.ts`: saved runs keep the mark and are rejected if it is negative or not conserved; runs saved before this change resume with no meal marked.
- `app/physical/body-lens.ts`: `mealLevels`, `mealOrgan`, `mealHeld`, `mealFate`, `mealLumen`.
- `app/physical/PhysicalScene.tsx`, `physical.css`: the lens, its legend, the organ labels and the fate strip.
- `tests/meal-mark.test.ts` (new, in `test:p4`), `tests/body-lens.test.ts`, `tests/browser/physical-anatomy.spec.ts`.

## Results

- 60 g carbohydrate, 20 g protein, 15 g fat at rest. After 5 minutes: portal blood carries 0.37× resting arterial glucose from the meal, arterial 0.15×. After 30 minutes: portal 1.30×, arterial 0.76×. After two hours: 33 g of the carbohydrate is liver glycogen, 11 g is burned, 7.6 g is still in the stomach and intestine.
- A marked run and the same run with the mark switched off are identical in every value other than the mark.
- The label sums to the meal within 1e-9 g at every check over four hours and never exceeds what a pool holds.

## Verification

Typecheck; physiology 18/18; anatomy 11/11; meal pathway 26/26 (5 new); multiscale 11/11; tissue 9/9; circulation 6/6; browser `physical-anatomy.spec.ts` 6/6.

## Limits

- Blood compartments are well mixed, so no front travels along a single vessel.
- The model moves only net amounts between blood and tissue, so arterial glucose is about two thirds meal-derived at 30 minutes, faster than tracer studies report. The label itself exchanges in both directions.
- Glucose made from labelled amino acids is not labelled; that carbon is counted as burned protein.
- The colour follows carbohydrate only. Protein and fat appear in the strip.
