/**
 * Turns the published datasets in data/published/ into sample people for the body app:
 * public/samples/people/<id>.json and index.json. Each person is in the same shape as an import
 * (glucose, heart rate, steps, sleep, logged meals, blood tests), packed small.
 *
 *   npx tsx scripts/personal/published-people.ts
 *
 * Every file carries its dataset's credit and licence; CGMacros people stay CC BY-NC-SA 4.0.
 */
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { parseDexcom } from "../../app/personal/cgm";
import { DAY, dayOf, parseTime, type Interval, type LabResult, type Point, type SeriesKind } from "../../app/personal/data";
import { labResult, type AnalyteId } from "../../app/personal/panel";
import { pack, type Credit, type PersonFile, type PersonSummary } from "../../app/personal/people";

const ROOT = new URL("../../data/published/", import.meta.url);
const OUT = new URL("../../public/samples/people/", import.meta.url);
const MIN = 60_000;

/** CSV with quoted fields that may hold commas and line breaks (the Shanghai diet column does). */
function csv(path: string, header?: string): Record<string, string>[] {
  let text = readFileSync(new URL(path, ROOT), "utf8").replace(/^﻿/, "");
  if (header && !text.startsWith(header.split(",")[0])) text = `${header}\n${text}`;
  const rows: string[][] = [];
  let row: string[] = [],
    field = "",
    quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') (field += '"'), i++;
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") row.push(field), (field = "");
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field), rows.push(row), (row = []), (field = "");
    } else field += c;
  }
  if (field || row.length) row.push(field), rows.push(row);
  const head = rows[0].map((h) => h.trim());
  return rows.slice(1).filter((r) => r.length > 1).map((r) => Object.fromEntries(head.map((h, i) => [h, r[i] ?? ""])));
}
const num = (s: string | undefined) => (s === undefined || s.trim() === "" ? NaN : Number(s));

/** Mean of readings in each `step` minutes, stamped at the start of the bin. */
function bin(points: Point[], step: number): Point[] {
  const bins = new Map<number, [number, number]>();
  for (const p of points) {
    if (!Number.isFinite(p.v)) continue;
    const k = Math.floor(p.t / (step * MIN)) * step * MIN;
    const b = bins.get(k) ?? [0, 0];
    (b[0] += p.v), b[1]++, bins.set(k, b);
  }
  return [...bins].sort((a, b) => a[0] - b[0]).map(([t, [s, n]]) => ({ t, v: s / n }));
}
/** Counts summed per `step` minutes, as points covering [t, t + step). */
function sumBins(points: Point[], step: number): Point[] {
  const bins = new Map<number, number>();
  for (const p of points) if (Number.isFinite(p.v)) bins.set(Math.floor(p.t / (step * MIN)) * step * MIN, (bins.get(Math.floor(p.t / (step * MIN)) * step * MIN) ?? 0) + p.v);
  return [...bins].sort((a, b) => a[0] - b[0]).map(([t, v]) => ({ t, v, end: t + step * MIN }));
}
/** Runs of minutes with the same label, joined when under `gap` apart. */
function runs<T>(minutes: { t: number; label: T | null }[], gap = 2 * MIN) {
  const out: { start: number; end: number; label: T }[] = [];
  for (const m of minutes.sort((a, b) => a.t - b.t)) {
    if (m.label === null) continue;
    const last = out.at(-1);
    if (last && last.label === m.label && m.t - last.end <= gap) last.end = m.t + MIN;
    else out.push({ start: m.t, end: m.t + MIN, label: m.label });
  }
  return out;
}
function labs(rows: [AnalyteId, number, string][], source: string, at?: number): LabResult[] {
  const out: LabResult[] = [];
  for (const [id, v, unit] of rows) {
    if (!Number.isFinite(v)) continue;
    const { result, warning } = labResult(id, v, unit, source, at);
    if (warning) console.warn(`  ${source}: ${warning}`);
    if (result) out.push(result);
  }
  return out;
}

const people: PersonFile[] = [];
function add(p: Omit<PersonFile, "base" | "series" | "has" | "days"> & { series: [SeriesKind, string, Point[]][] }) {
  const all = p.series.flatMap(([, , pts]) => pts.map((x) => x.t));
  const base = dayOf(Math.min(...all, ...p.intervals.map((i) => i.start)));
  const series = p.series.filter(([, , pts]) => pts.length).map(([kind, source, pts]) => pack(base, kind, source, pts));
  const days = new Set(all.map(dayOf)).size;
  const has = [
    ...new Set([
      ...series.map((s) => ({ glucose: "glucose sensor", heartRate: "heart rate", steps: "steps" })[s.kind as string] ?? s.kind),
      ...p.intervals.map((i) => ({ meal: "logged meals", sleep: "sleep", workout: "activity" })[i.kind]),
      ...(p.labs.length ? ["blood tests"] : []),
    ]),
  ];
  people.push({ ...p, base, series, has, days });
}

// ---------------------------------------------------------------- CGMacros
const CGMACROS: Credit = {
  dataset: "CGMacros 1.0.0 (PhysioNet)",
  licence: "CC BY-NC-SA 4.0",
  url: "https://doi.org/10.13026/3z8q-x658",
  cite: "Gutierrez-Osuna R, Kerr D, Mortazavi B, Das A. CGMacros: a scientific dataset for personalized nutrition and diet monitoring (v1.0.0). PhysioNet, 2025.",
};
const groupOf = (a1c: number) => (a1c < 5.7 ? "Healthy" : a1c < 6.5 ? "Prediabetes" : "Type 2 diabetes");
const bio = csv("cgmacros/bio.csv");
for (const file of readdirSync(new URL("cgmacros/", ROOT)).filter((f) => /^CGMacros-\d+\.csv$/.test(f))) {
  const n = file.match(/\d+/)![0],
    b = bio.find((r) => +r.subject === +n)!;
  const rows = csv(`cgmacros/${file}`);
  const source = `CGMacros ${n}`;
  const t = rows.map((r) => parseTime(r.Timestamp));
  // Dexcom G6 reads every 5 minutes; the file fills the minutes between by interpolation, so keep its 5-minute marks.
  const glucose = rows.map((r, i) => ({ t: t[i], v: num(r["Dexcom GL"]) })).filter((p) => Number.isFinite(p.v) && (p.t / MIN) % 5 === 0);
  const hr = bin(rows.map((r, i) => ({ t: t[i], v: num(r.HR) })), 5);
  // METs (×10 in the file) to activity: 3 to 6 is a walk, over 6 a run, held for 10 minutes or more.
  const active = runs(rows.map((r, i) => {
    const met = num(r.METs) / 10;
    return { t: t[i], label: met >= 6 ? "Vigorous activity (running pace)" : met >= 3 ? "Moderate activity (walking pace)" : null };
  })).filter((r) => r.end - r.start >= 10 * MIN);
  const meals: Interval[] = rows.flatMap((r, i) => {
    if (!r["Meal Type"]) return [];
    const share = Number.isFinite(num(r["Amount Consumed"])) ? num(r["Amount Consumed"]) / 100 : 1;
    const g = (k: string) => (Number.isFinite(num(r[k])) ? Math.round(num(r[k]) * share) : undefined);
    return [{ kind: "meal" as const, start: t[i], end: t[i], source, label: `${r["Meal Type"]}, ${Math.round(num(r.Calories) * share)} kcal`, carbs: g("Carbs"), protein: g("Protein"), fat: g("Fat") }];
  });
  // The fasting draw was on the first study day.
  const drawn = dayOf(t[0]) + 8 * 3600_000;
  const a1c = num(b["A1c PDL (Lab)"]);
  add({
    id: `cgmacros-${n}`,
    name: `CGMacros participant ${+n}`,
    group: groupOf(a1c),
    about: `${b.Gender === "F" ? "Woman" : "Man"}, ${b.Age}, BMI ${Math.round(num(b.BMI))}. Wore two glucose sensors and a Fitbit for about ten days and photographed every meal; carbs, protein and fat were estimated from the photos.`,
    profile: { age: +b.Age, sex: b.Gender === "F" ? "female" : "male" },
    credit: CGMACROS,
    series: [["glucose", `${source} (Dexcom G6)`, glucose], ["heartRate", `${source} (Fitbit Sense)`, hr]],
    intervals: [...meals, ...active.map((a) => ({ kind: "workout" as const, activity: a.label, start: a.start, end: a.end, source }))],
    labs: labs([
      ["hba1c", a1c, "%"], ["glucose", num(b["Fasting GLU - PDL (Lab)"]), "mg/dL"], ["insulin", num(b.Insulin), "µIU/mL"],
      ["triglycerides", num(b.Triglycerides), "mg/dL"], ["cholesterol", num(b.Cholesterol), "mg/dL"], ["hdl", num(b.HDL), "mg/dL"],
      ["ldl", num(b["LDL (Cal)"]) < 800 ? num(b["LDL (Cal)"]) : NaN, "mg/dL"],
    ], source, drawn),
  });
}

// ---------------------------------------------------------------- BIG IDEAs Lab
const BIG: Credit = {
  dataset: "BIG IDEAs Lab Glycemic Variability and Wearable Device Data 1.1.3 (PhysioNet)",
  licence: "ODC-By 1.0",
  url: "https://doi.org/10.13026/aw6y-fc44",
  cite: "Cho P, Kim J, Bent B, Dunn J. BIG IDEAs Lab Glycemic Variability and Wearable Device Data (v1.1.3). PhysioNet, 2026. Bent B et al. npj Digital Medicine 4, 89 (2021).",
};
const demo = csv("big_ideas/Demographics.csv");
for (const id of readdirSync(new URL("big_ideas/", ROOT)).filter((f) => /^\d{3}$/.test(f))) {
  const d = demo.find((r) => +r.ID === +id)!;
  const source = `BIG IDEAs ${id}`;
  const g = parseDexcom(readFileSync(new URL(`big_ideas/${id}/Dexcom_${id}.csv`, ROOT), "utf8"), source).series[0].points;
  // Several foods logged at the same moment are one meal.
  const food = new Map<number, { carbs: number; protein: number; fat: number; items: string[] }>();
  // 003's log has no header line and fewer columns: kcal, carbs, sugar and protein, no fat.
  for (const r of csv(`big_ideas/${id}/Food_Log_${id}.csv`, "date,time,time_begin,logged_food,amount,unit,searched_food,calorie,total_carb,sugar,protein")) {
    const at = parseTime(r.time_begin || `${r.date} ${r.time}`);
    if (!Number.isFinite(at)) continue;
    const m = food.get(at) ?? { carbs: 0, protein: 0, fat: 0, items: [] };
    (m.carbs += num(r.total_carb) || 0), (m.protein += num(r.protein) || 0), (m.fat += r.total_fat === undefined ? NaN : num(r.total_fat) || 0), m.items.push(r.logged_food);
    food.set(at, m);
  }
  const hr = bin(csv(`big_ideas/${id}/HR_${id}_first3days.csv`).map((r) => ({ t: parseTime(r.datetime), v: num(r.hr) })), 5);
  const a1c = num(d.HbA1c);
  add({
    id: `bigideas-${id}`,
    name: `BIG IDEAs participant ${+id}`,
    group: groupOf(a1c),
    about: `${d.Gender === "FEMALE" ? "Woman" : "Man"}. Wore a Dexcom G6 and a research wristband for about ten days and logged food in an app.`,
    profile: { sex: d.Gender === "FEMALE" ? "female" : "male" },
    credit: BIG,
    series: [["glucose", `${source} (Dexcom G6)`, g], ["heartRate", `${source} (Empatica E4)`, hr]],
    intervals: [...food].map(([at, m]) => ({ kind: "meal" as const, start: at, end: at, source, carbs: Math.round(m.carbs), protein: Math.round(m.protein), ...(Number.isFinite(m.fat) ? { fat: Math.round(m.fat) } : {}), label: m.items.join(", ").slice(0, 120) })),
    labs: labs([["hba1c", a1c, "%"]], source),
  });
}

// ---------------------------------------------------------------- Shanghai T1DM / T2DM
const SHANGHAI: Credit = {
  dataset: "Shanghai T1DM and T2DM datasets (figshare 21600933 v5)",
  licence: "CC BY 4.0",
  url: "https://doi.org/10.1038/s41597-023-01940-7",
  cite: "Zhao Q, Zhu J, Shen X, et al. Chinese diabetes datasets for data-driven machine learning. Scientific Data 10, 35 (2023).",
};
for (const type of ["T1DM", "T2DM"] as const) {
  const summary = csv(`shanghai_t1dm_t2dm/${type}_summary_selected.csv`);
  for (const s of summary) {
    const pid = s["Patient Number"],
      short = pid.split("_")[0];
    const rows = csv(`shanghai_t1dm_t2dm/${type}_${pid}.csv`);
    const source = `Shanghai ${type} ${short}`;
    const glucose = rows.map((r) => ({ t: parseTime(r.Date), v: num(r["CGM (mg / dl)"]) })).filter((p) => Number.isFinite(p.t) && Number.isFinite(p.v));
    // Meals are logged as text ("Rice 150 g"), with no carbohydrate count.
    const meals = rows
      .filter((r) => r["Dietary intake"]?.trim())
      .map((r) => ({ kind: "meal" as const, start: parseTime(r.Date), end: parseTime(r.Date), source, label: r["Dietary intake"].replace(/\s*\n\s*/g, ", ").slice(0, 120) }))
      .filter((m) => Number.isFinite(m.start));
    const key = (re: RegExp) => s[Object.keys(s).find((k) => re.test(k))!];
    const insulinTreated = /insulin|gansulin|novolin|humulin|degludec|glargine|aspart|lispro|detemir/i.test(key(/^Hypoglycemic Agents/));
    const age = +key(/^Age/),
      sex = key(/^Gender/) === "1" ? "female" : "male";
    add({
      id: `shanghai-${short}`,
      name: `Shanghai patient ${short}`,
      group: type === "T1DM" ? "Type 1 diabetes" : "Type 2 diabetes",
      about: `${sex === "female" ? "Woman" : "Man"}, ${age}, ${type === "T1DM" ? "type 1" : "type 2"} diabetes for ${key(/^Duration/)} years${insulinTreated ? ", on insulin" : ""}. Wore a glucose sensor (15-minute readings) for two weeks; meals were written down without carb counts.`,
      profile: { age, sex },
      credit: SHANGHAI,
      series: [["glucose", source, glucose]],
      intervals: meals,
      labs: labs([
        ["glucose", num(key(/^Fasting Plasma Glucose/)), "mg/dL"],
        // Injected insulin is in the blood too, so a fasting insulin level says nothing about the pancreas.
        ["insulin", insulinTreated ? NaN : num(key(/^Fasting Insulin/)), "pmol/L"],
        ["cpeptide", num(key(/^Fasting C-peptide/)), "nmol/L"],
        ["hba1c", num(key(/^HbA1c/)), "mmol/mol"],
        ["cholesterol", num(key(/^Total Cholesterol/)), "mmol/L"], ["triglycerides", num(key(/^Triglyceride/)), "mmol/L"],
        ["hdl", num(key(/^High-Density/)), "mmol/L"], ["ldl", num(key(/^Low-Density/)), "mmol/L"],
        ["creatinine", num(key(/^Creatinine/)), "µmol/L"], ["egfr", num(key(/^Estimated Glomerular/)), "mL/min"],
      ], source, glucose[0] ? dayOf(glucose[0].t) + 7 * 3600_000 : undefined),
    });
  }
}

// ---------------------------------------------------------------- Fitabase Fitbit
const FITABASE: Credit = {
  dataset: "Crowd-sourced Fitbit datasets 03.12.2016-05.12.2016 (Zenodo 53894)",
  licence: "CC BY 4.0",
  url: "https://doi.org/10.5281/zenodo.53894",
  cite: "Furberg R, Brinton J, Keating M, Ortiz A. Crowd-sourced Fitbit datasets 03.12.2016-05.12.2016. Zenodo, 2016.",
};
const hrAll = csv("fitabase/heartrate_minute_derived.csv"),
  stepsAll = csv("fitabase/minuteStepsNarrow_merged.csv"),
  sleepAll = csv("fitabase/minuteSleep_merged.csv");
const fitIds = [...new Set(hrAll.map((r) => r.Id))];
fitIds.forEach((uid, k) => {
  const source = `Fitbit user ${k + 1}`;
  const hr = bin(hrAll.filter((r) => r.Id === uid).map((r) => ({ t: parseTime(r.ActivityMinute), v: num(r.HeartRateMean) })), 5);
  const steps = sumBins(stepsAll.filter((r) => r.Id === uid).map((r) => ({ t: parseTime(r.ActivityMinute), v: num(r.Steps) })), 15).filter((p) => p.v > 0);
  // Fitbit sleep minutes: 1 asleep, 2 restless, 3 awake.
  const sleep = runs(sleepAll.filter((r) => r.Id === uid).map((r) => ({ t: parseTime(r.date), label: r.value === "1" ? ("asleep" as const) : r.value === "2" || r.value === "3" ? ("awake" as const) : null })));
  add({
    id: `fitbit-${k + 1}`,
    name: `Fitbit user ${k + 1}`,
    group: "Band only",
    about: "Shared a month of Fitbit data in a 2016 survey: heart rate, steps and sleep, but no glucose or blood tests.",
    profile: {},
    credit: FITABASE,
    series: [["heartRate", source, hr], ["steps", source, steps]],
    intervals: sleep.map((s) => ({ kind: "sleep" as const, stage: s.label, start: s.start, end: s.end, source })),
    labs: [],
  });
});

// ---------------------------------------------------------------- write
mkdirSync(OUT, { recursive: true });
const ORDER = ["Healthy", "Prediabetes", "Type 2 diabetes", "Type 1 diabetes", "Band only"];
people.sort((a, b) => ORDER.indexOf(a.group) - ORDER.indexOf(b.group) || a.id.localeCompare(b.id));
for (const p of people) writeFileSync(new URL(`${p.id}.json`, OUT), JSON.stringify(p));
const index: PersonSummary[] = people.map(({ id, name, group, about, profile, has, days, credit }) => ({ id, name, group, about, profile, has, days, credit }));
writeFileSync(new URL("index.json", OUT), JSON.stringify(index, null, 1) + "\n");
for (const p of people)
  console.log(`${p.id.padEnd(18)} ${p.group.padEnd(16)} ${String(p.days).padStart(3)} days  ${p.has.join(", ")}  (${p.labs.length} labs)`);
void DAY;
