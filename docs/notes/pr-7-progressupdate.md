# PR 7 progress note: look back in a run

Written 2026-10-07. Step 2 of the list (marked meal, scrub back in time, pumping heart, meal route, tissue uptake zoom, contraction and reflex). Steps 1 and 3 merged in PR 5.

## Decisions

- Looking back is view-only by default; continuing from a past moment is a separate, explicit button, because it discards the later part of the run.
- Snapshots are whole states, so everything that reads the state shows the past with no per-panel work, including the meal label and the solved heartbeat.
- Plotted history and receipts are not copied into snapshots. History is cut by time and receipts by identifier, since a receipt can be issued at the same second as a snapshot.
- A snapshot is forced after every input, replacing one taken at the same second, so continuing from that moment keeps the input.

## Not done

- Playing the past forward as an animation without changing the run.
- Rewinding a comparison fork together with the run.
- Saving the timeline in an exported run.

## Follow-up, 2026-10-08: hormone colour option (T6.2)

- The task asked for a distinct colour per hormone. Thirty-one distinct hues are not achievable, so colour encodes eight families and the name is always written. This is a deliberate departure from the task as written.
- The palette was run through a validator against the stage background before use; all five checks pass, with the worst adjacent colour-vision pair at 8.4.
- Rejected: colouring blood beads by a mix of elevated hormones. A bead has no stable identity in the bead callback, so colours would flicker, and the model has no per-vessel hormone level to show anyway.
- Per-part colour needed a second meaning for the style texture's fourth channel: 1 is the warm and cool lens, 2 and above is a hormone family.
- Not done: hormone molecular structures (T6.3, the molecule thread's area); per-compartment hormone transport.
