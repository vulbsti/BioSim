/**
 * Gate A4: a real export goes in, and the replay must follow the measured curve.
 * Importers call `followCurve` with the measured points and the drawn (simulated) series.
 * Passing means every measured point has a drawn value within the stated margin.
 * When the model cannot follow, the measurement wins on screen and this result says where the gap is.
 */
export type Point = {t: number; v: number};
export type RoundTrip = {
  name: string;
  unit: string;
  margin: number;
  pass: boolean;
  /** Largest absolute gap and when it happened (seconds). */
  worst: {t: number; measured: number; drawn: number; gap: number};
  /** Share of measured points within the margin. */
  within: number;
  points: {t: number; measured: number; drawn: number}[];
};

/** Linear interpolation of a time-sorted series; null outside its range. */
export function valueAt(series: Point[], t: number): number | null {
  if (!series.length || t < series[0].t || t > series[series.length - 1].t) return null;
  let lo = 0, hi = series.length - 1;
  while (hi - lo > 1) {const mid = (lo + hi) >> 1; if (series[mid].t <= t) lo = mid; else hi = mid;}
  const a = series[lo], b = series[hi];
  return b.t === a.t ? a.v : a.v + ((b.v - a.v) * (t - a.t)) / (b.t - a.t);
}

export function followCurve(name: string, measured: Point[], drawn: Point[], {margin, unit}: {margin: number; unit: string}): RoundTrip {
  const sorted = [...drawn].sort((a, b) => a.t - b.t);
  const points = measured.map((m) => ({t: m.t, measured: m.v, drawn: valueAt(sorted, m.t) ?? NaN}));
  let worst = {t: 0, measured: NaN, drawn: NaN, gap: 0}, ok = 0;
  for (const p of points) {
    // A measured point with nothing drawn at its time is a gap of infinite size.
    const gap = Number.isFinite(p.drawn) ? Math.abs(p.drawn - p.measured) : Infinity;
    if (gap <= margin) ok++;
    if (gap > worst.gap || !Number.isFinite(worst.measured)) worst = {...p, gap};
  }
  return {name, unit, margin, pass: points.length > 0 && ok === points.length, worst, within: points.length ? ok / points.length : 0, points};
}

/** Importers save each round trip here; the report page picks them up. */
export async function saveRoundTrip(r: RoundTrip) {
  const {mkdirSync, writeFileSync} = await import('node:fs');
  const {OUT} = await import('./report-data');
  mkdirSync(OUT, {recursive: true});
  writeFileSync(`${OUT}/round-trip-${r.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.json`, JSON.stringify(r, null, 1));
}
