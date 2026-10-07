# Look back in a run

Branch `claude/project-thread-n3u9i3`, from `simulate` after PR #5 merged.

Before: a run only moved forward. To see what the body looked like ten minutes into a meal, you had to reset and run it again.

After: a *Look back* slider appears under the run controls once a run has moved. Dragging it shows an earlier moment everywhere at once: the vitals, the traces, the body view with its colours, organ labels, meal strip and beating heart. The run pauses while you look. *Return to now* goes back to the present, and *Continue from here* makes the moment shown the present and drops what came after it.

How: the solver worker keeps a snapshot of the body state every 30 simulated seconds, and after every input. A long jump is advanced in 30-second steps so it leaves moments behind it. Snapshots leave out the plotted history and the receipts, which only grow at the end; the live run's copies, cut at the snapshot, stand in for them. At most 400 snapshots are kept: past that, the older half is thinned to every second one, so recent moments stay at full detail.

## Changes

- `app/simulation/timeline.ts` (new): `record`, `nearest`, `materialize`, `truncate`.
- `app/simulation/simulation.worker.ts`: records as it advances; `view` and `continue` commands; any other command returns to the present first; reset, scenario, import and pathway switches start a new timeline.
- `app/simulation/use-simulation.ts`, `Simulator.tsx`, `simulation.css`: the slider and its two buttons; the status reads "LOOKING BACK".
- `tests/timeline.test.ts` (new, in `test:physiology`), one new test in `tests/browser/simulation.spec.ts`.

## Verification

- An earlier moment comes back equal to the state the run had then, field for field, and the present is unchanged by looking.
- Continuing from an earlier moment and advancing reproduces the original future exactly.
- Typecheck; physiology 21/21 (3 new); meal pathway 26/26; multiscale 11/11; circulation 6/6; browser `simulation.spec.ts` 9/9 (1 new).

## Limits

- Looking back is by snapshot, so moments are 30 simulated seconds apart, and further apart in the older half of runs longer than about three hours.
- Continuing from an earlier moment ends a comparison fork; the fork is not rewound.
- Switching the physical meal pathway or the muscle patch starts a new timeline.
- Snapshots live in the worker's memory and are not part of an exported run.

## Added 2026-10-08: hormones as a colour option

Before: hormones could not be chosen in *Colour by*, and nothing on the body showed which gland was active.

After: *Colour by → Hormones* colours each of fourteen structures by the hormone it releases that is furthest from baseline, and labels it with that hormone's name and level. A list of all 31 hormones, grouped into eight families, sits beside the body; choosing one leaves only its sources and its targets coloured and tints the blood by its level.

Why eight colours and not 31: no palette of 31 hues can be told apart, least of all with a colour-vision deficiency. Colour carries the family, using the eight dark-surface steps of a categorical palette that passes lightness, chroma, adjacent colour-vision separation and 3:1 contrast against the stage background `#131d24`; identity within a family is carried by the written name.

- `app/physical/hormone-lens.ts` (new): families and colours, the fourteen structures, where each hormone is released and acts, `hormoneShades`, `mostChanged`.
- `app/physical/body-lens.ts`: the `hormones` option.
- `app/physical/PhysicalScene.tsx`, `physical.css`: per-part family colour in the fragment shader, the hormone list, the structure labels.
- `tests/hormone-lens.test.ts` (new, in `test:anatomy`), one new test in `tests/browser/physical-anatomy.spec.ts`.

Results, 25 minutes after a 60 g carbohydrate meal: pancreas shows insulin at 3.12×, stomach gastrin at 2.87×, small intestine GLP-1 at 2.13×; nothing is labelled at rest.

Verification: hormone lens 3/3; body lens 3/3; heart motion 6/6; physical anatomy 6/6; browser `physical-anatomy.spec.ts` 8/8 (1 new).

Limits: the model keeps one body-wide level per hormone, so blood has one tint everywhere and nothing shows a hormone travelling. Fat, muscle, bone, vessels and nerves have no single structure in the atlas: leptin has no source shown, angiotensin II has none, and several targets are omitted. Family colours on adjacent structures (pancreas yellow beside adrenal orange) are separable only with the labels. Labels of neighbouring structures can overlap.
