# PR 5 progress note: follow one meal

Written 2026-10-07. Step 1 of the list left by the body-state work (marked meal, scrub back in time, pumping heart, meal route, tissue uptake zoom, contraction and reflex).

## What was tried

1. **Label in the view.** Rejected. The view receives a state every 250 ms, 30 simulated seconds at 120×, while the per-step flux records cover one second, so the view cannot integrate where the meal went.
2. **Label carried by net transfers only.** Blood became almost entirely meal-derived within 30 minutes, because the model moves only net amounts from blood to tissue and nothing unlabelled came back.
3. **Label exchanged in both directions (kept).** Blood and tissue exchange the label on its own gradient with the same permeability and exact two-pool step as the amounts. Arterial glucose is then about two thirds meal-derived at 30 minutes.
4. **Scale.** A scale ending at 1× resting arterial glucose saturated the portal vein and the arteries alike; it now ends at 1.5×.
5. **Stomach and intestine.** With only blood and tissue coloured, the liver lit first while the stomach, holding nearly the whole meal, stayed plain. Both are now coloured by the share of the meal inside them.

## Decisions

- The newest meal takes the mark (chosen by utkarsh).
- The mark lives in the transport state, with fixed keys, so saved runs validate against a template.

## Not done

- Scrubbing back in time, a per-vessel front, colour options for the meal's protein and fat.
- The built-in browser pane did not draw the 3D scene, so the visual check used headless Chromium screenshots.
