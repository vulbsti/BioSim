# Verification

The two gates from [the vision](../docs/VISION.md#6-verification-system), as code. Run them before asking for a merge and attach the report.

```sh
npm run verify                 # everything, then builds verify-report/index.html
npm run verify:directions      # A3 direction table, A4 and A5 self-tests (Node, seconds)
npm run verify:visual          # A1, A2 cards and the B screen budget (browser, minutes)
npm run verify:containment -- --parts "vagus|spinal" --clear-of system:skeletal --allow 0.002
npm run verify:nerves     # the Z-Anatomy cord and nerves: inside the skin and clear of bone
npm run verify:report          # rebuild the page from whatever ran
```

On uxserver use the GPU and the running dev server:

```sh
BIOSIM_GL=egl BIOSIM_URL=http://localhost:3017 npm run verify
VERIFY_CARDS=meal-sugar,exercise-heart npm run verify:visual   # just some cards
```

`verify-report/index.html` is one self-contained page with every screenshot embedded. Open it from disk or attach it to the PR.

## Adding to it

| Gate | Where | What you add |
|---|---|---|
| A1, A2 cause → effect, rest vs change | `cards.ts` | A card: cause, what a person should see, shots, and a rest/change pair. Write it **before** building the mechanism; mark it `pending` until then. |
| A3 direction | `directions.ts` | A row: cause, what to read, up/down/settles, by when. A row the engine cannot test yet gets `pending` with what is missing. |
| A4 data round trip | `round-trip.ts` | Your importer calls `followCurve(measured, drawn, {margin, unit})` and `saveRoundTrip(result)`. |
| A5 inside the body | `containment.ts` | Run it on your new parts. Add a card with Front, Back, Side and ¾ shots. `--except` drops obstacles by name (the atlas files a few muscles, such as tibialis anterior, under skeletal). The nerves gate leaves out the inferior alveolar and mental nerves, which run inside the jaw bone in life. |
| B budget | `budget.ts` | Nothing; it measures the main screen. If you add a control, remove one. |

Card steps (`Step` in `cards.ts`) are the controls a person uses: situations, eating, water, exercise, skipping ahead, watching a vital sign, colour lens, what to show, camera angle and region, finding a part, the chart. `driver.ts` is the only file that knows the app's labels; when the UI changes, fix it there.

Screenshots are taken with time paused and anatomical motion off, once the frame stops changing, so they repeat. The rest/change comparison hides every overlay first, so changing numbers in the top bar do not count as the body changing. A pair passes when at least 0.4% of the frame changes and at least three times what the same frame differs from itself.

A6, the five-second test, stays human: each card in the report hides its one-line answer until you have looked.
