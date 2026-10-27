/**
 * Fitness band and watch exports: Apple Health (export.xml), Oura (API v2 JSON for sleep and daily
 * activity), and a plain CSV with a time column and any of heart rate, HRV, steps, SpO2 and breathing
 * rate (what Fitbit, Garmin and Whoop exports can be reduced to).
 */
import {
  csvLine,
  dateOrder,
  lines,
  number,
  parseTime,
  DAY,
  MG_PER_MMOL_GLUCOSE,
  type Imported,
  type Interval,
  type Point,
  type SeriesKind,
  type SleepStage,
} from "./data";

const APPLE_SERIES: Record<string, SeriesKind> = {
  HKQuantityTypeIdentifierHeartRate: "heartRate",
  HKQuantityTypeIdentifierRestingHeartRate: "restingHeartRate",
  HKQuantityTypeIdentifierHeartRateVariabilitySDNN: "hrvSdnn",
  HKQuantityTypeIdentifierStepCount: "steps",
  HKQuantityTypeIdentifierOxygenSaturation: "spo2",
  HKQuantityTypeIdentifierRespiratoryRate: "respiratoryRate",
  HKQuantityTypeIdentifierBloodGlucose: "glucose",
};
const APPLE_SLEEP: Record<string, SleepStage | null> = {
  HKCategoryValueSleepAnalysisInBed: null,
  HKCategoryValueSleepAnalysisAsleep: "asleep",
  HKCategoryValueSleepAnalysisAsleepUnspecified: "asleep",
  HKCategoryValueSleepAnalysisAsleepCore: "light",
  HKCategoryValueSleepAnalysisAsleepDeep: "deep",
  HKCategoryValueSleepAnalysisAsleepREM: "rem",
  HKCategoryValueSleepAnalysisAwake: "awake",
};

const attributes = (tag: string) => {
  const out: Record<string, string> = {};
  for (const m of tag.matchAll(/(\w+)="([^"]*)"/g)) out[m[1]] = m[2];
  return out;
};

/**
 * Reads Apple Health's export.xml in pieces, since it is often hundreds of megabytes. Feed it text
 * with push() as the file streams in, then call finish().
 */
export class AppleHealthReader {
  private rest = "";
  private points = new Map<SeriesKind, Point[]>();
  private intervals: Interval[] = [];
  private skipped = 0;
  constructor(private source = "Apple Health") {}
  push(chunk: string) {
    const text = this.rest + chunk;
    let last = 0;
    for (const m of text.matchAll(/<(Record|Workout)\s[^>]*>/g)) {
      this.tag(m[1], attributes(m[0]));
      last = m.index! + m[0].length;
    }
    // Keep an unfinished tag for the next piece; anything before it is done with.
    const open = text.lastIndexOf("<");
    this.rest = open >= last ? text.slice(open) : "";
  }
  private tag(name: string, a: Record<string, string>) {
    const start = parseTime(a.startDate ?? ""),
      end = parseTime(a.endDate ?? "");
    if (!Number.isFinite(start)) return void this.skipped++;
    if (name === "Workout") {
      const activity = (a.workoutActivityType ?? "").replace("HKWorkoutActivityType", "") || "Workout";
      this.intervals.push({ kind: "workout", activity, start, end: Number.isFinite(end) ? end : start, source: this.source });
      return;
    }
    if (a.type === "HKCategoryTypeIdentifierSleepAnalysis") {
      const stage = APPLE_SLEEP[a.value];
      if (stage && Number.isFinite(end)) this.intervals.push({ kind: "sleep", stage, start, end, source: this.source });
      return;
    }
    const kind = APPLE_SERIES[a.type];
    if (!kind) return;
    let v = number(a.value);
    if (!Number.isFinite(v)) return void this.skipped++;
    // Apple writes SpO2 as a fraction and glucose sometimes as mmol<180.15...>/L.
    if (kind === "spo2" && v <= 1) v *= 100;
    if (kind === "glucose" && /mmol/i.test(a.unit ?? "")) v *= MG_PER_MMOL_GLUCOSE;
    const p: Point = kind === "steps" ? { t: start, v, end: Number.isFinite(end) ? end : start } : { t: start, v };
    let list = this.points.get(kind);
    if (!list) this.points.set(kind, (list = []));
    list.push(p);
  }
  finish(): Imported {
    const series = [...this.points].map(([kind, points]) => ({ kind, source: this.source, points: points.sort((a, b) => a.t - b.t) }));
    const warnings = this.skipped ? [`${this.skipped} records had no readable time or value.`] : [];
    if (!series.length && !this.intervals.length) warnings.push("No heart, step, sleep or workout records were found.");
    return { source: this.source, series, intervals: this.intervals.sort((a, b) => a.start - b.start), labs: [], warnings };
  }
}
export function parseAppleHealth(xml: string, source = "Apple Health"): Imported {
  const r = new AppleHealthReader(source);
  r.push(xml);
  return r.finish();
}

/** Oura stage letters in sleep_phase_5_min. */
const OURA_STAGE: Record<string, SleepStage> = { "1": "deep", "2": "light", "3": "rem", "4": "awake" };
type OuraSample = { interval?: number; items?: (number | null)[]; timestamp?: string };
type OuraDoc = {
  bedtime_start?: string;
  sleep_phase_5_min?: string;
  heart_rate?: OuraSample;
  hrv?: OuraSample;
  day?: string;
  steps?: number;
};

/**
 * Oura API v2 JSON: a sleep collection ({"data":[{bedtime_start, sleep_phase_5_min, heart_rate, hrv}]})
 * or a daily_activity collection ({"data":[{day, steps}]}). Oura's HRV is RMSSD.
 */
export function parseOura(json: string, source = "Oura"): Imported {
  let doc: { data?: OuraDoc[]; sleep?: OuraDoc[]; daily_activity?: OuraDoc[] };
  try {
    doc = JSON.parse(json);
  } catch {
    return { source, series: [], intervals: [], labs: [], warnings: ["The file is not valid JSON."] };
  }
  // The data export from the Oura app holds several collections in one file.
  const docs = [...(doc.data ?? []), ...(doc.sleep ?? []), ...(doc.daily_activity ?? [])];
  const hr: Point[] = [],
    hrv: Point[] = [],
    steps: Point[] = [],
    intervals: Interval[] = [];
  const samples = (s: OuraSample | undefined, into: Point[]) => {
    const t0 = parseTime(s?.timestamp ?? "");
    if (!s?.items || !Number.isFinite(t0)) return;
    s.items.forEach((v, i) => typeof v === "number" && into.push({ t: t0 + i * (s.interval ?? 300) * 1000, v }));
  };
  for (const d of docs) {
    if (d.sleep_phase_5_min && d.bedtime_start) {
      const t0 = parseTime(d.bedtime_start);
      // Neighbouring five-minute blocks of the same stage become one interval.
      [...d.sleep_phase_5_min].forEach((c, i) => {
        const stage = OURA_STAGE[c];
        if (!stage || !Number.isFinite(t0)) return;
        const start = t0 + i * 300_000,
          last = intervals.at(-1);
        if (last?.kind === "sleep" && last.stage === stage && last.end === start) last.end += 300_000;
        else intervals.push({ kind: "sleep", stage, start, end: start + 300_000, source });
      });
    }
    samples(d.heart_rate, hr);
    samples(d.hrv, hrv);
    if (d.day && typeof d.steps === "number") {
      const t = parseTime(d.day);
      if (Number.isFinite(t)) steps.push({ t, v: d.steps, end: t + DAY });
    }
  }
  const series = (
    [
      ["heartRate", hr],
      ["hrvRmssd", hrv],
      ["steps", steps],
    ] as [SeriesKind, Point[]][]
  )
    .filter(([, p]) => p.length)
    .map(([kind, points]) => ({ kind, source, points: points.sort((a, b) => a.t - b.t) }));
  const warnings = series.length || intervals.length ? [] : ["No Oura sleep or activity data was found."];
  return { source, series, intervals, labs: [], warnings };
}

const CSV_COLUMNS: [RegExp, SeriesKind][] = [
  [/resting/i, "restingHeartRate"],
  [/sdnn/i, "hrvSdnn"],
  [/hrv|rmssd|variability/i, "hrvRmssd"],
  [/heart|^hr$|bpm|pulse/i, "heartRate"],
  [/step/i, "steps"],
  [/spo2|oxygen|saturation/i, "spo2"],
  [/resp|breath/i, "respiratoryRate"],
];

/**
 * A CSV with a time column and one column per measurement, named in plain words ("heart_rate",
 * "HRV (ms)", "steps", "SpO2", "respiratory rate"). An optional "sleep" or "stage" column of
 * awake/light/deep/rem/asleep gives sleep stages, each row lasting until the next.
 */
export function parseBandCsv(text: string, source = "Fitness band"): Imported {
  const all = lines(text);
  if (all.length < 2) return { source, series: [], intervals: [], labs: [], warnings: ["The file has no rows."] };
  const header = csvLine(all[0]);
  const time = header.findIndex((h) => /time|date/i.test(h));
  const cols = header.map((h, i) => (i === time ? null : (CSV_COLUMNS.find(([re]) => re.test(h))?.[1] ?? null)));
  const stage = header.findIndex((h) => /sleep|stage/i.test(h));
  const rows = all.slice(1).map((l) => csvLine(l));
  const order = dateOrder(rows.slice(0, 200).map((r) => r[time]));
  const points = new Map<SeriesKind, Point[]>(),
    intervals: Interval[] = [];
  rows.forEach((r, n) => {
    const t = parseTime(r[time] ?? "", order);
    if (!Number.isFinite(t)) return;
    cols.forEach((kind, i) => {
      if (!kind || i === stage) return;
      const v = number(r[i]);
      if (!Number.isFinite(v)) return;
      if (!points.has(kind)) points.set(kind, []);
      const next = parseTime(rows[n + 1]?.[time] ?? "", order);
      points.get(kind)!.push(kind === "steps" ? { t, v, end: Number.isFinite(next) ? next : t + 60_000 } : { t, v });
    });
    const s = stage >= 0 ? (r[stage] ?? "").toLowerCase() : "";
    const st = (["awake", "light", "deep", "rem", "asleep"] as SleepStage[]).find((x) => s.includes(x));
    if (st) {
      const next = parseTime(rows[n + 1]?.[time] ?? "", order);
      intervals.push({ kind: "sleep", stage: st, start: t, end: Number.isFinite(next) ? next : t + 300_000, source });
    }
  });
  if (time < 0) return { source, series: [], intervals: [], labs: [], warnings: ["No time or date column was found."] };
  const series = [...points].map(([kind, p]) => ({ kind, source, points: p }));
  const warnings = series.length || intervals.length ? [] : ["No heart rate, HRV, steps, SpO2, breathing or sleep columns were found."];
  return { source, series, intervals, labs: [], warnings };
}
