/**
 * Continuous glucose monitor exports: FreeStyle Libre (LibreView CSV), Dexcom (Clarity CSV), and a
 * plain two-column file of time and glucose. Every reading becomes mg/dL.
 */
import {
  MG_PER_MMOL_GLUCOSE,
  csvLine,
  dateOrder,
  lines,
  number,
  parseTime,
  type Imported,
  type Interval,
  type Point,
} from "./data";

export type CgmFormat = "libre" | "dexcom" | "plain";

/** A CGM cannot read outside this; Dexcom writes "Low" and "High" for the ends. */
const LOW = 40,
  HIGH = 400;

const find = (header: string[], test: RegExp) => header.findIndex((h) => test.test(h));
const isMmol = (h: string) => /mmol/i.test(h);
const toMg = (v: number, mmol: boolean) => (mmol ? v * MG_PER_MMOL_GLUCOSE : v);
const sep = (line: string) => (line.split(";").length > line.split(",").length ? ";" : ",");

/** Which export this is, from its first lines. */
export function detectCgm(text: string): CgmFormat | null {
  const head = lines(text).slice(0, 3).join("\n");
  if (/Historic Glucose|Device Timestamp/i.test(head)) return "libre";
  if (/Event Type/i.test(head) && /Glucose Value/i.test(head)) return "dexcom";
  if (/gluc/i.test(lines(text)[0] ?? "")) return "plain";
  return null;
}

export function parseCgm(text: string, source = "CGM"): Imported {
  const format = detectCgm(text);
  if (format === "libre") return parseLibre(text, source);
  if (format === "dexcom") return parseDexcom(text, source);
  if (format === "plain") return parsePlain(text, source);
  return { source, series: [], intervals: [], labs: [], warnings: ["This does not look like a Libre, Dexcom or time and glucose CSV."] };
}

/**
 * LibreView: a title line, then a header with "Device Timestamp", "Record Type", "Historic Glucose
 * mg/dL" (or mmol/L) and "Scan Glucose". Record type 0 is the automatic 15-minute reading, 1 a scan,
 * 5 a food note with optional carbohydrate grams.
 */
export function parseLibre(text: string, source = "FreeStyle Libre"): Imported {
  const all = lines(text);
  const at = all.findIndex((l) => /Device Timestamp/i.test(l));
  const warnings: string[] = [];
  if (at < 0) return { source, series: [], intervals: [], labs: [], warnings: ["No Libre header line was found."] };
  const s = sep(all[at]);
  const header = csvLine(all[at], s);
  const col = {
    time: find(header, /Device Timestamp/i),
    type: find(header, /Record Type/i),
    historic: find(header, /Historic Glucose/i),
    scan: find(header, /Scan Glucose/i),
    carbs: find(header, /Carbohydrates \(grams\)/i),
  };
  const mmol = isMmol(header[col.historic] ?? header[col.scan] ?? "");
  const rows = all.slice(at + 1).map((l) => csvLine(l, s));
  const order = dateOrder(rows.slice(0, 200).map((r) => r[col.time]));
  const points: Point[] = [],
    meals: Interval[] = [];
  let skipped = 0;
  for (const r of rows) {
    const t = parseTime(r[col.time] ?? "", order);
    if (!Number.isFinite(t)) {
      skipped++;
      continue;
    }
    const type = number(r[col.type]);
    if (type === 0 || type === 1) {
      const v = number(r[type === 0 ? col.historic : col.scan]);
      if (Number.isFinite(v)) points.push({ t, v: toMg(v, mmol) });
    } else if (type === 5) {
      const carbs = number(r[col.carbs]);
      meals.push({ kind: "meal", start: t, end: t, source, ...(Number.isFinite(carbs) ? { carbs } : {}) });
    }
  }
  if (skipped) warnings.push(`${skipped} rows had no readable time and were left out.`);
  return finish(source, points, meals, warnings);
}

/**
 * Dexcom Clarity: a header with "Timestamp (YYYY-MM-DDThh:mm:ss)", "Event Type" and "Glucose Value
 * (mg/dL)". The first rows hold patient and device details; readings are the "EGV" rows. Carbs
 * logged in the app are "Carbs" rows.
 */
export function parseDexcom(text: string, source = "Dexcom"): Imported {
  const all = lines(text);
  const at = all.findIndex((l) => /Event Type/i.test(l));
  if (at < 0) return { source, series: [], intervals: [], labs: [], warnings: ["No Dexcom header line was found."] };
  const s = sep(all[at]);
  const header = csvLine(all[at], s);
  const col = {
    time: find(header, /^Timestamp/i),
    type: find(header, /Event Type/i),
    glucose: find(header, /Glucose Value/i),
    carbs: find(header, /Carb Value/i),
  };
  const mmol = isMmol(header[col.glucose]);
  const points: Point[] = [],
    meals: Interval[] = [];
  let ends = 0;
  for (const l of all.slice(at + 1)) {
    const r = csvLine(l, s);
    const type = (r[col.type] ?? "").toUpperCase();
    const t = parseTime(r[col.time] ?? "");
    if (!Number.isFinite(t)) continue;
    if (type === "EGV") {
      const raw = r[col.glucose] ?? "";
      let v = number(raw);
      if (/^low$/i.test(raw)) (v = mmol ? LOW / MG_PER_MMOL_GLUCOSE : LOW), ends++;
      if (/^high$/i.test(raw)) (v = mmol ? HIGH / MG_PER_MMOL_GLUCOSE : HIGH), ends++;
      if (Number.isFinite(v)) points.push({ t, v: toMg(v, mmol) });
    } else if (type === "CARBS") {
      const carbs = number(r[col.carbs]);
      meals.push({ kind: "meal", start: t, end: t, source, ...(Number.isFinite(carbs) ? { carbs } : {}) });
    }
  }
  const warnings = ends ? [`${ends} readings were past what the sensor can read and are shown at its limit.`] : [];
  return finish(source, points, meals, warnings);
}

/** Any CSV with a time column and a column whose name holds "gluc". mmol/L if the name says so. */
export function parsePlain(text: string, source = "Glucose"): Imported {
  const all = lines(text);
  const s = sep(all[0]);
  const header = csvLine(all[0], s);
  const g = find(header, /gluc/i);
  let t = find(header, /time|date/i);
  if (t < 0) t = g === 0 ? 1 : 0;
  const rows = all.slice(1).map((l) => csvLine(l, s));
  // A column of values all under 35 can only be mmol/L.
  const values = rows.map((r) => number(r[g])).filter(Number.isFinite);
  const mmol = isMmol(header[g]) || (values.length > 0 && Math.max(...values) < 35);
  const order = dateOrder(rows.slice(0, 200).map((r) => r[t]));
  const points: Point[] = [];
  for (const r of rows) {
    const time = parseTime(r[t] ?? "", order),
      v = number(r[g]);
    if (Number.isFinite(time) && Number.isFinite(v)) points.push({ t: time, v: toMg(v, mmol) });
  }
  return finish(source, points, [], []);
}

function finish(source: string, points: Point[], meals: Interval[], warnings: string[]): Imported {
  points.sort((a, b) => a.t - b.t);
  const out = points.filter((p, i) => i === 0 || p.t !== points[i - 1].t);
  const odd = out.filter((p) => p.v < 20 || p.v > 600).length;
  if (odd) warnings.push(`${odd} readings are outside 20 to 600 mg/dL; check the unit.`);
  if (!out.length) warnings.push("No glucose readings were found.");
  return {
    source,
    series: out.length ? [{ kind: "glucose", source, points: out }] : [],
    intervals: meals,
    labs: [],
    warnings,
  };
}
