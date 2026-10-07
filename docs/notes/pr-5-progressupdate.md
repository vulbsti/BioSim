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

## Follow-up, same day: heart model and chamber motion

Approved order: simulation first, Blender geometry after.

- Measured before building: the atlas already has closed cavity meshes for all four chambers (98, 117, 84 and 52 mL), both atrial walls, the ventricular wall, 11 leaflets and cusps and 5 papillary muscles. Missing: conduction system and chordae.
- The body model keeps heart rate, stroke volume and pressure. The heart model is solved to reproduce them, by bisection on stressed volume, so nothing in the physiology changed.
- Uniform scaling of the wall with the cavity was rejected: emptying to 44% would shrink the outer surface by a quarter. A sink field in normalised radius keeps wall volume instead: the cavity surface scales by the cube root of the fill and outer layers move less.
- A plain radial sink in real distance was rejected: at end systole it would collapse every cavity vertex nearer than about 2.4 cm to the centre. Normalising by the cavity's radius in each direction avoids that.
- The rig is built offline because heart parts and cavities can arrive in different chunks at load.
- Not done: leaflet hinges, conduction system, chordae (the Blender step); twist and long-axis shortening; pressure-volume loop display.
