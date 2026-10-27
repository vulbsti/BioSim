/**
 * What a person brings: measurements from their own devices and tests, in one shape.
 *
 * Times are wall-clock milliseconds written as if they were UTC (Date.UTC of the local date and time
 * the device showed). A CGM at 13:10 local time is 13:10 here whatever the time zone, which is what a
 * day replay needs. Parsers that read a time zone offset convert to the local clock.
 */

/** Something measured again and again over time. */
export const SERIES = {
  glucose: { name: "Glucose", unit: "mg/dL" },
  heartRate: { name: "Heart rate", unit: "bpm" },
  restingHeartRate: { name: "Resting heart rate", unit: "bpm" },
  /** Heart rate variability as RMSSD (Oura, Whoop, Garmin) or SDNN (Apple Watch); they differ about 1.3×. */
  hrvRmssd: { name: "Heart rate variability (RMSSD)", unit: "ms" },
  hrvSdnn: { name: "Heart rate variability (SDNN)", unit: "ms" },
  steps: { name: "Steps", unit: "steps" },
  spo2: { name: "Blood oxygen", unit: "%" },
  respiratoryRate: { name: "Breathing rate", unit: "breaths/min" },
} as const;
export type SeriesKind = keyof typeof SERIES;
/** A reading at time t. For counts (steps) the reading covers [t, end). */
export type Point = { t: number; v: number; end?: number };
export type Series = { kind: SeriesKind; source: string; points: Point[] };

export type SleepStage = "awake" | "light" | "deep" | "rem" | "asleep";
export type Interval =
  | { kind: "sleep"; stage: SleepStage; start: number; end: number; source: string }
  | { kind: "workout"; activity: string; start: number; end: number; source: string }
  | { kind: "meal"; start: number; end: number; source: string; carbs?: number };

/** One blood test result, already converted to the analyte's standard unit (see panel.ts). */
export type LabResult = {
  analyte: string;
  value: number;
  /** When the blood was drawn, if known. */
  at?: number;
  /** The value and unit as written on the report, so the person can check the conversion. */
  entered: { value: number; unit: string };
  source: string;
};

export type PersonalData = { series: Series[]; intervals: Interval[]; labs: LabResult[] };
/** What one file gave, and what in it could not be read. */
export type Imported = PersonalData & { source: string; warnings: string[] };

export const emptyData = (): PersonalData => ({ series: [], intervals: [], labs: [] });

/** Adds an import to what is already there. Readings of the same kind are merged and sorted by time. */
export function merge(into: PersonalData, add: PersonalData): PersonalData {
  const series = into.series.map((s) => ({ ...s, points: [...s.points] }));
  for (const s of add.series) {
    const same = series.find((x) => x.kind === s.kind && x.source === s.source);
    if (same) same.points.push(...s.points);
    else series.push({ ...s, points: [...s.points] });
  }
  for (const s of series) {
    s.points.sort((a, b) => a.t - b.t);
    // The same file imported twice must not count twice.
    s.points = s.points.filter((p, i, all) => i === 0 || p.t !== all[i - 1].t || p.end !== all[i - 1].end);
  }
  const key = (i: Interval) => `${i.kind}|${i.start}|${i.end}|${i.source}`;
  const seen = new Set(into.intervals.map(key));
  const intervals = [...into.intervals, ...add.intervals.filter((i) => !seen.has(key(i)))].sort(
    (a, b) => a.start - b.start,
  );
  const labs = [...into.labs.filter((l) => !add.labs.some((n) => n.analyte === l.analyte && n.at === l.at)), ...add.labs];
  return { series, intervals, labs };
}

export const DAY = 86_400_000;
/** Midnight (wall clock) of the day holding t. */
export const dayOf = (t: number) => Math.floor(t / DAY) * DAY;
/** Days that have readings of this kind, oldest first, with how much of each day is covered (0 to 1). */
export function days(data: PersonalData, kind: SeriesKind, spacing = 15 * 60_000) {
  const counts = new Map<number, number>();
  for (const s of data.series)
    if (s.kind === kind) for (const p of s.points) counts.set(dayOf(p.t), (counts.get(dayOf(p.t)) ?? 0) + 1);
  return [...counts]
    .sort((a, b) => a[0] - b[0])
    .map(([day, n]) => ({ day, coverage: Math.min(1, (n * spacing) / DAY) }));
}
/** All readings of one kind between from and to, from every source, sorted by time. */
export function readings(data: PersonalData, kind: SeriesKind, from = -Infinity, to = Infinity) {
  return data.series
    .filter((s) => s.kind === kind)
    .flatMap((s) => s.points)
    .filter((p) => p.t >= from && p.t < to)
    .sort((a, b) => a.t - b.t);
}

// Helpers the parsers share.

/** Splits one CSV line, honouring quotes. The separator is a comma unless given. */
export function csvLine(line: string, sep = ","): string[] {
  const out: string[] = [];
  let cell = "",
    quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quoted) {
      if (c === '"' && line[i + 1] === '"') (cell += '"'), i++;
      else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === sep) out.push(cell.trim()), (cell = "");
    else cell += c;
  }
  out.push(cell.trim());
  return out;
}
export const lines = (text: string) => text.replace(/^﻿/, "").split(/\r?\n/).filter((l) => l.trim() !== "");
/** A number written with a dot or a decimal comma; NaN when there is none. */
export const number = (s: string | undefined) => (s === undefined || s.trim() === "" ? NaN : Number(s.trim().replace(",", ".")));

/** mmol/L of glucose to mg/dL. */
export const MG_PER_MMOL_GLUCOSE = 18.016;

/**
 * Reads a date and time. ISO forms ("2026-10-01T13:10:00", "2026-10-01 13:10") always work. For day
 * and month in either order ("01-10-2026 13:10"), order says which comes first.
 * With a "+0100" style offset the result is that local clock time, not UTC.
 */
export function parseTime(s: string, order: "dmy" | "mdy" = "mdy"): number {
  s = s.trim();
  let m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[T ](\d{1,2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?)?\s*(Z|[+-]\d{2}:?\d{2})?$/);
  if (m) return Date.UTC(+m[1], +m[2] - 1, +m[3], +(m[4] ?? 0), +(m[5] ?? 0), +(m[6] ?? 0));
  m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})(?:[T ,]+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([AaPp][Mm])?)?$/);
  if (!m) return NaN;
  const [a, b] = [+m[1], +m[2]];
  let [day, month] = order === "dmy" ? [a, b] : [b, a];
  // A first number over 12 can only be a day, whatever was asked for.
  if (month > 12 && day <= 12) [day, month] = [month, day];
  const year = m[3].length === 2 ? 2000 + +m[3] : +m[3];
  let hour = +(m[4] ?? 0);
  if (m[7]) hour = (hour % 12) + (/p/i.test(m[7]) ? 12 : 0);
  if (month < 1 || month > 12 || day < 1 || day > 31) return NaN;
  return Date.UTC(year, month - 1, day, hour, +(m[5] ?? 0), +(m[6] ?? 0));
}

/**
 * Guesses whether a column of day-month dates is written day first. A first number above 12 can only
 * be a day, as can a second number above 12. When every date fits both ways (the first twelve days of
 * a month), the order that keeps consecutive rows closest together in time wins: readings come minutes
 * apart, not months. Falls back to month first.
 */
export function dateOrder(samples: string[]): "dmy" | "mdy" {
  for (const s of samples) {
    const m = s?.trim().match(/^(\d{1,2})[-/.](\d{1,2})[-/.]\d{2,4}/);
    if (!m) continue;
    if (+m[1] > 12) return "dmy";
    if (+m[2] > 12) return "mdy";
  }
  const spread = (order: "dmy" | "mdy") => {
    const t = samples.map((s) => parseTime(s ?? "", order)).filter(Number.isFinite);
    return t.reduce((a, v, i) => (i ? a + Math.abs(v - t[i - 1]) : 0), 0);
  };
  return spread("dmy") < spread("mdy") ? "dmy" : "mdy";
}
