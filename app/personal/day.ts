/**
 * One real day as a run of the body model: the measured glucose curve to draw against the model,
 * meals found in that curve (or logged with it), sleep and activity from the band, all as a Scenario
 * the simulator already knows how to play.
 */
import type { Action, Scenario } from "../simulation/types";
import { DAY, readings, type Interval, type PersonalData, type Point } from "./data";

/** Simulated time 0 is this hour of the day (see endocrine.ts); the replay starts there. */
export const CLOCK_START_HOUR = 8;
const HOUR = 3_600_000,
  MIN = 60_000;

export type FoundMeal = {
  /** Wall-clock time the meal was probably eaten. */
  at: number;
  carbs: number;
  /** Where it came from: logged by the person, or found from a rise in the curve. */
  how: "logged" | "found";
  /** The rise in mg/dL that gave it away (found meals). */
  rise?: number;
};
export type DayReplay = {
  scenario: Scenario;
  /** The measured curves in simulated seconds, for drawing over the model's. */
  measured: { glucose: { time: number; value: number }[]; heartRate: { time: number; value: number }[] };
  meals: FoundMeal[];
  /** Wall-clock start of the replay. */
  start: number;
};

/** Glucose on an even grid (default 5 min), linear between readings; gaps over 45 min stay empty. */
export function resample(points: Point[], from: number, to: number, step = 5 * MIN, gap = 45 * MIN) {
  const out: Point[] = [];
  let i = 0;
  for (let t = from; t <= to; t += step) {
    while (i < points.length - 1 && points[i + 1].t <= t) i++;
    const a = points[i],
      b = points[i + 1];
    if (!a) break;
    if (a.t === t) out.push({ t, v: a.v });
    else if (b && a.t < t && b.t > t && b.t - a.t <= gap) out.push({ t, v: a.v + ((b.v - a.v) * (t - a.t)) / (b.t - a.t) });
  }
  return out;
}

/**
 * Finds meals from rises in glucose. A meal is a climb of at least minRise mg/dL from a low point
 * within 90 minutes. It was eaten about 10 minutes before the climb starts. Its carbohydrate is read
 * from the size of the rise: about 1.35 g per mg/dL, so a 75 g meal gives a typical 55 mg/dL rise.
 * People who handle sugar slowly rise more per gram, so the factor scales with insulin sensitivity.
 */
export function findMeals(points: Point[], { minRise = 25, gramsPerRise = 1.35, insulinSensitivity = 1 } = {}): FoundMeal[] {
  if (points.length < 4) return [];
  // Three-reading moving average, to step over sensor noise.
  const s = points.map((p, i) => ({ t: p.t, v: (points[Math.max(0, i - 1)].v + p.v + points[Math.min(points.length - 1, i + 1)].v) / 3 }));
  const meals: FoundMeal[] = [];
  let i = 0;
  while (i < s.length - 1) {
    // From a low point, look for the highest point within 90 minutes, stopping if sugar falls back.
    let peak = i;
    for (let j = i + 1; j < s.length && s[j].t - s[i].t <= 90 * MIN; j++) {
      if (s[j].v > s[peak].v) peak = j;
      if (s[j].v < s[i].v) break;
    }
    const rise = s[peak].v - s[i].v;
    if (rise >= minRise) {
      // Carry the peak on while it keeps climbing past the 90 minutes.
      while (peak + 1 < s.length && s[peak + 1].v >= s[peak].v && s[peak + 1].t - s[peak].t <= 30 * MIN) peak++;
      // The climb starts at the last point still near the low; the meal was eaten about 10 minutes before.
      let low = i;
      for (let k = i; k < peak; k++) if (s[k].v < s[low].v) low = k;
      const total = s[peak].v - s[low].v;
      // The last moment before the peak that sugar was still near its low, so a bump on the way is skipped.
      let onset = peak;
      while (onset > low && s[onset].v > s[low].v + 0.1 * total) onset--;
      meals.push({ at: s[onset].t - 10 * MIN, carbs: Math.round(Math.min(150, Math.max(10, total * gramsPerRise * insulinSensitivity))), how: "found", rise: Math.round(total) });
      // Ride the curve down to its next low point; a meal eaten on the way down starts there.
      i = peak;
      while (i + 1 < s.length && s[i + 1].v <= s[i].v) i++;
    } else i++;
  }
  return meals;
}

/** Sleep blocks (any stage but awake) joined across short wakings of under 30 minutes. */
export function sleepBlocks(intervals: Interval[], gap = 30 * MIN) {
  const asleep = intervals
    .filter((i) => i.kind === "sleep" && i.stage !== "awake")
    .map((i) => ({ start: i.start, end: i.end }))
    .sort((a, b) => a.start - b.start);
  const out: { start: number; end: number }[] = [];
  for (const b of asleep) {
    const last = out.at(-1);
    if (last && b.start - last.end < gap) last.end = Math.max(last.end, b.end);
    else out.push({ ...b });
  }
  return out.filter((b) => b.end - b.start >= 20 * MIN);
}

/** How hard each kind of workout works the body, on the model's 0 to 1 exercise scale. */
const WORKOUT: [RegExp, number][] = [
  [/run|hiit|interval|rowing|swim/i, 0.7],
  [/cycl|bik|elliptical|stair|hik/i, 0.55],
  [/walk/i, 0.3],
  [/yoga|pilates|stretch|mind/i, 0.15],
];
const workoutLevel = (activity: string) => WORKOUT.find(([re]) => re.test(activity))?.[1] ?? 0.45;
/** Steps per minute to exercise: a brisk walk (110 a minute) is 0.35, running (160) about 0.6. */
const stepLevel = (perMinute: number) => (perMinute < 30 ? 0 : Math.min(0.7, (perMinute / 110) * 0.35 + (perMinute > 130 ? 0.15 : 0)));

/**
 * The replay of the day that begins at `day` (any time in it), from CLOCK_START_HOUR for 24 hours.
 * Logged meals are used when the CGM file has them; otherwise meals are found from the curve.
 */
export function dayReplay(data: PersonalData, day: number, { insulinSensitivity = 1, label = "" } = {}): DayReplay {
  const start = Math.floor(day / DAY) * DAY + CLOCK_START_HOUR * HOUR,
    end = start + DAY;
  const sim = (t: number) => Math.round((t - start) / 1000);
  const inDay = (t: number) => t >= start && t < end;
  const glucose = readings(data, "glucose", start - 2 * HOUR, end);
  const logged = data.intervals.filter((i) => i.kind === "meal" && inDay(i.start));
  const meals: FoundMeal[] = logged.length
    ? logged.map((i) => ({ at: i.start, carbs: (i.kind === "meal" && i.carbs) || 50, how: "logged" as const }))
    : findMeals(resample(glucose, start - 2 * HOUR, end), { insulinSensitivity }).filter((m) => inDay(m.at));

  const events: Scenario["events"] = [];
  const at = (t: number, label: string, action: Action) => events.push({ at: Math.max(0, sim(t)), label, action });
  const clock = (t: number) => new Date(t).toISOString().slice(11, 16);
  for (const m of meals) {
    // A mixed meal in the same proportions as the "After a meal" scenario.
    const c = m.carbs;
    at(m.at, `${m.how === "logged" ? "Meal" : "Meal found"} at ${clock(m.at)}, about ${c} g carbs`, {
      kind: "meal",
      meal: { carbs: c, protein: Math.round(c / 3), fat: Math.round(c * 0.27), water: 300, sodium: 600 },
    });
  }
  for (const b of sleepBlocks(data.intervals)) {
    if (b.end <= start || b.start >= end) continue;
    at(Math.max(b.start, start), `Asleep at ${clock(b.start)}`, { kind: "environment", values: { sleep: 1 } });
    if (b.end < end) at(b.end, `Awake at ${clock(b.end)}`, { kind: "environment", values: { sleep: 0 } });
  }
  // Activity, 15 minutes at a time: a workout sets the level; otherwise steps do.
  const workouts = data.intervals.filter((i) => i.kind === "workout" && i.end > start && i.start < end);
  const steps = readings(data, "steps", start - DAY, end);
  let level = 0;
  for (let t = start; t < end; t += 15 * MIN) {
    const w = workouts.find((i) => i.start < t + 15 * MIN && i.end > t);
    let next = w && w.kind === "workout" ? workoutLevel(w.activity) : 0;
    if (!w) {
      let n = 0;
      for (const p of steps) {
        const pe = p.end ?? p.t;
        const overlap = Math.min(pe, t + 15 * MIN) - Math.max(p.t, t);
        // A count spread over its whole span: a daily total says nothing about this quarter hour.
        if (overlap > 0 && pe - p.t <= 2 * HOUR) n += (p.v * overlap) / Math.max(MIN, pe - p.t);
      }
      next = stepLevel(n / 15);
    }
    next = Math.round(next * 20) / 20;
    if (Math.abs(next - level) >= 0.1 || (next === 0 && level !== 0)) {
      at(t, next ? `Active from ${clock(t)}${w && w.kind === "workout" ? `: ${w.activity}` : ""}` : `Resting from ${clock(t)}`, {
        kind: "environment",
        values: { exercise: next },
      });
      level = next;
    }
  }
  events.sort((a, b) => a.at - b.at);
  const date = new Date(start).toISOString().slice(0, 10);
  return {
    start,
    meals,
    measured: {
      glucose: glucose.filter((p) => inDay(p.t)).map((p) => ({ time: sim(p.t), value: p.v })),
      heartRate: readings(data, "heartRate", start, end).map((p) => ({ time: sim(p.t), value: p.v })),
    },
    scenario: {
      id: `day-${date}`,
      name: label || `Your day, ${date}`,
      description: `Your measured day from ${clock(start)}: ${meals.length} meal${meals.length === 1 ? "" : "s"}${
        meals.some((m) => m.how === "found") ? " found from your glucose" : ""
      }, with sleep and activity from your band where you have it.`,
      duration: DAY / 1000,
      events,
    },
  };
}

/**
 * How closely a model curve follows a measured one (check A4 of the plan). For each measured point the
 * model value at the same time is read by linear interpolation. Returns the mean and largest gap and
 * the share of points within the margin.
 */
export function follow(model: { time: number; value: number }[], measured: { time: number; value: number }[], margin = 20) {
  const gaps: number[] = [];
  let j = 0;
  for (const m of measured) {
    while (j < model.length - 2 && model[j + 1].time < m.time) j++;
    const a = model[j],
      b = model[j + 1];
    if (!a || !b || m.time < a.time || m.time > b.time) continue;
    const v = b.time === a.time ? a.value : a.value + ((b.value - a.value) * (m.time - a.time)) / (b.time - a.time);
    gaps.push(Math.abs(v - m.value));
  }
  if (!gaps.length) return { points: 0, mean: NaN, max: NaN, within: NaN };
  return {
    points: gaps.length,
    mean: gaps.reduce((a, b) => a + b, 0) / gaps.length,
    max: Math.max(...gaps),
    within: gaps.filter((g) => g <= margin).length / gaps.length,
  };
}
