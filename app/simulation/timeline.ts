import type { BodyState } from "./types";

/**
 * Snapshots of a run, so an earlier moment can be shown again or continued from.
 *
 * A snapshot is the whole body state without its plotted history and receipts. Those two only
 * ever grow at the end, so the live state's copies, cut at the snapshot, stand in for them.
 */
export type Snapshot = { time: number; state: BodyState };
/** Simulated seconds between snapshots, and how many are kept before older ones are thinned. */
export const TIMELINE = { interval: 30, limit: 400 };

/** Records the state. A snapshot already taken at this time is replaced. */
export function record(timeline: Snapshot[], s: BodyState, force = false) {
  const last = timeline.at(-1);
  if (last && s.time < last.time) truncate(timeline, s.time);
  if (!force && last && s.time !== last.time && s.time - last.time < TIMELINE.interval) return;
  const snapshot = { time: s.time, state: structuredClone({ ...s, history: [], receipts: [] }) };
  if (timeline.at(-1)?.time === s.time) timeline[timeline.length - 1] = snapshot;
  else timeline.push(snapshot);
  // Long runs keep recent moments at full detail and older ones at half, again and again.
  if (timeline.length > TIMELINE.limit) {
    const half = Math.floor(timeline.length / 2);
    const kept = timeline.filter((_, i) => i >= half || i % 2 === 0);
    timeline.length = 0;
    timeline.push(...kept);
  }
}
/** Drops every snapshot later than `time`. */
export function truncate(timeline: Snapshot[], time: number) {
  while (timeline.length && timeline[timeline.length - 1].time > time) timeline.pop();
}
/** Index of the snapshot nearest to `time`. */
export function nearest(timeline: Snapshot[], time: number) {
  let best = 0;
  for (let i = 1; i < timeline.length; i++)
    if (Math.abs(timeline[i].time - time) < Math.abs(timeline[best].time - time)) best = i;
  return best;
}
/**
 * The full state at a snapshot. History and receipts come from the live run, cut at the
 * snapshot: samples up to its time, and receipts issued before its next identifier.
 */
export function materialize(snapshot: Snapshot, live: BodyState): BodyState {
  return {
    ...structuredClone(snapshot.state),
    history: structuredClone(live.history.filter((p) => p.time <= snapshot.time)),
    receipts: structuredClone(live.receipts.filter((r) => r.id < snapshot.state.nextId)),
  };
}
