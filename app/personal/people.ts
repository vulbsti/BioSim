/**
 * Sample people: real measurements that people agreed to publish (CGMacros, BIG IDEAs Lab, Shanghai
 * T1DM/T2DM, Fitabase Fitbit), each turned into the same PersonalData shape an import gives. They let
 * the body app show a real day before anyone brings their own data. Built by
 * scripts/personal/published-people.ts from data/published/ into public/samples/people/.
 */
import type { Profile } from "./baseline";
import type { Interval, LabResult, PersonalData, SeriesKind } from "./data";

export type Credit = { dataset: string; licence: string; url: string; cite: string };
/** One row of index.json: enough to list a person without loading their readings. */
export type PersonSummary = {
  id: string;
  name: string;
  /** "Healthy", "Prediabetes", "Type 2 diabetes", "Type 1 diabetes" or "Band only". */
  group: string;
  /** One plain line on who this is and what was measured. */
  about: string;
  profile: Profile;
  has: string[];
  days: number;
  credit: Credit;
};
/** Readings stored as minutes after `base`, so a fortnight of five-minute glucose stays small. */
export type PackedSeries = { kind: SeriesKind; source: string; t: number[]; v: number[]; end?: number[] };
export type PersonFile = PersonSummary & {
  base: number;
  series: PackedSeries[];
  intervals: Interval[];
  labs: LabResult[];
};

const MIN = 60_000;
export function pack(base: number, kind: SeriesKind, source: string, points: { t: number; v: number; end?: number }[]): PackedSeries {
  const s: PackedSeries = { kind, source, t: points.map((p) => Math.round((p.t - base) / MIN)), v: points.map((p) => Math.round(p.v * 10) / 10) };
  if (points.some((p) => p.end !== undefined)) s.end = points.map((p) => Math.round(((p.end ?? p.t) - p.t) / MIN));
  return s;
}
export function unpack(file: PersonFile): PersonalData {
  return {
    series: file.series.map((s) => ({
      kind: s.kind,
      source: s.source,
      points: s.t.map((m, i) => {
        const t = file.base + m * MIN;
        return s.end ? { t, v: s.v[i], end: t + s.end[i] * MIN } : { t, v: s.v[i] };
      }),
    })),
    intervals: file.intervals,
    labs: file.labs,
  };
}
