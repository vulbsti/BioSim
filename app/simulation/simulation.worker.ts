/// <reference lib="webworker" />
import { advance, applyAction, createBody, schedule } from "./engine";
import { scenarios } from "./scenarios";
import type { Action, BodyState, Scenario } from "./types";
import { materialize, nearest, record, truncate, TIMELINE, type Snapshot } from "./timeline";

let state = createBody(),
  running = false,
  speed = 120,
  fraction = 0;
// Snapshots of this run, and which one is being looked at; null shows the present.
const timeline: Snapshot[] = [];
let viewing: number | null = null;
record(timeline, state);
function restart() {
  timeline.length = 0;
  viewing = null;
  record(timeline, state);
}
function publish(error?: string) {
  self.postMessage({
    state: viewing === null ? state : materialize(timeline[viewing], state),
    running,
    speed,
    timeline: { times: timeline.map((t) => t.time), now: state.time, viewing: viewing === null ? null : timeline[viewing].time },
    error,
  });
}
/** Advances in steps of one snapshot interval, so a long jump still leaves moments to look back at. */
function advanceRecorded(s: BodyState, seconds: number) {
  for (let left = seconds; left > 0; left -= TIMELINE.interval) {
    advance(s, Math.min(left, TIMELINE.interval));
    record(timeline, s);
  }
}
function tick(seconds: number) {
  advanceRecorded(state, seconds);
}
self.onmessage = (e: MessageEvent) => {
  try {
    const m = e.data;
    // Looking back changes nothing. Every other command acts on the present.
    if (m.type === "continue" && viewing !== null) {
      // Take up the run from the moment shown: later moments are dropped.
      state = materialize(timeline[viewing], state);
      truncate(timeline, state.time);
    }
    if (m.type !== "view") viewing = null;
    switch (m.type) {
      case "init":
      case "continue":
        break;
      case "view":
        running = false;
        viewing = m.time === null || timeline.length < 2 ? null : nearest(timeline, Number(m.time));
        if (viewing === timeline.length - 1 && timeline[viewing].time === state.time) viewing = null;
        break;
      case "run":
        running = !!m.running;
        break;
      case "speed":
        if (![1, 30, 120, 600, 3600].includes(m.speed)) throw new Error("Unsupported playback speed.");
        speed = m.speed;
        fraction = 0;
        break;
      case "advance":
        running = false;
        tick(m.seconds);
        break;
      case "action":
        applyAction(state, m.action as Action, m.label);
        record(timeline, state, true);
        break;
      case "scenario": {
        // A built-in scenario by id, or one made from the person's own data (a day replay).
        const scenario: Scenario | undefined = m.scenario ?? scenarios.find((s) => s.id === m.id);
        if (!scenario) throw new Error("Unknown scenario.");
        running = false;
        fraction = 0;
        state = createBody();
        for (const event of scenario.events) schedule(state, event.at, event.action, event.label);
        advance(state, 0);
        restart();
        break;
      }
      case "reset":
        state = createBody();
        running = false;
        fraction = 0;
        restart();
        break;
      default:
        throw new Error("Unknown simulator command.");
    }
    publish();
  } catch (e) {
    running = false;
    publish(e instanceof Error ? e.message : String(e));
  }
};
setInterval(() => {
  if (!running) return;
  try {
    fraction += speed / 4;
    const seconds = Math.floor(fraction);
    fraction -= seconds;
    if (seconds > 0) tick(seconds);
    publish();
  } catch (e) {
    running = false;
    publish(e instanceof Error ? e.message : String(e));
  }
}, 250);
