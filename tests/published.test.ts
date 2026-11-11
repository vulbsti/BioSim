/**
 * Checks against real people's published data (data/published/, built into public/samples/people/ by
 * scripts/personal/published-people.ts): does meal finding land on the meals people logged, and does
 * the blood-test baseline call an ordinary adult ordinary?
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { personalBaseline } from "../app/personal/baseline";
import { emptyData, readings, type Interval } from "../app/personal/data";
import { dayReplay, findMeals, resample } from "../app/personal/day";
import { labResult, type AnalyteId } from "../app/personal/panel";
import { unpack, type PersonFile, type PersonSummary } from "../app/personal/people";

const DIR = new URL("../public/samples/people/", import.meta.url);
const MIN = 60_000;
const index = JSON.parse(readFileSync(new URL("index.json", DIR), "utf8")) as PersonSummary[];
const person = (id: string) => JSON.parse(readFileSync(new URL(`${id}.json`, DIR), "utf8")) as PersonFile;
const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor((xs.length - 1) / 2)];

test("every sample person is listed, loads, and carries its dataset's credit and licence", () => {
  const files = readdirSync(DIR).filter((f) => f !== "index.json").map((f) => f.replace(/\.json$/, ""));
  assert.deepEqual([...files].sort(), index.map((p) => p.id).sort());
  assert.equal(index.length, 17);
  for (const s of index) {
    const p = person(s.id),
      d = unpack(p);
    assert.ok(s.credit.licence && s.credit.url.startsWith("https://") && s.credit.cite, s.id);
    if (s.id.startsWith("cgmacros")) assert.equal(s.credit.licence, "CC BY-NC-SA 4.0");
    assert.ok(d.series.every((x) => x.points.every((pt, i, a) => !i || pt.t > a[i - 1].t)), `${s.id}: readings in order`);
    if (s.group !== "Band only") assert.ok(readings(d, "glucose").length > 500 && d.intervals.some((i) => i.kind === "meal"), s.id);
    else assert.ok(d.intervals.some((i) => i.kind === "sleep") && readings(d, "steps").length > 100, s.id);
  }
});

test("meals found from the glucose curve land on the meals people logged (14 people, about 650 meals)", () => {
  const rows: string[] = [];
  let judged = 0,
    hit = 0;
  const offs: number[] = [];
  for (const s of index.filter((p) => p.group !== "Band only")) {
    const d = unpack(person(s.id)),
      g = readings(d, "glucose");
    const found = findMeals(resample(g, g[0].t, g.at(-1)!.t, 5 * MIN));
    const meals = d.intervals.filter((i): i is Extract<Interval, { kind: "meal" }> => i.kind === "meal");
    // A meal can only be judged where the sensor shows a rise of 25 mg/dL or more in the two hours after it.
    const rose = (t: number) => {
      const w = g.filter((x) => x.t >= t - 15 * MIN && x.t <= t + 120 * MIN).map((x) => x.v);
      return w.length > 4 && Math.max(...w) - w[0] >= 25;
    };
    const mine: number[] = [];
    let n = 0;
    for (const m of meals.filter((m) => rose(m.start))) {
      n++;
      const near = found.reduce((a, b) => (Math.abs(b.at - m.start) < Math.abs(a.at - m.start) ? b : a));
      const off = (near.at - m.start) / MIN;
      if (Math.abs(off) <= 45) mine.push(off);
    }
    judged += n;
    hit += mine.length;
    offs.push(...mine);
    rows.push(`${s.id.padEnd(14)} ${String(meals.length).padStart(3)} logged, ${String(n).padStart(2)} with a visible rise, ${String(mine.length).padStart(2)} found within 45 min, median ${median(mine) > 0 ? "+" : ""}${median(mine)} min`);
  }
  console.log(`  ${rows.join("\n  ")}\n  all: ${hit}/${judged} found, median ${median(offs)} min, middle half ${median(offs.filter((o) => o < median(offs)))} to ${median(offs.filter((o) => o > median(offs)))} min`);
  assert.ok(hit / judged >= 0.75, `${hit}/${judged}`);
  assert.ok(Math.abs(median(offs)) <= 5, String(median(offs)));
});

test("a replayed day uses what was logged: protein and fat as given, and a size from the curve when carbs were not counted", () => {
  const c = unpack(person("cgmacros-043"));
  const meal = c.intervals.find((i): i is Extract<Interval, { kind: "meal" }> => i.kind === "meal" && (i.protein ?? 0) > 20)!;
  // Replays run from 08:00, so a meal before 08:00 belongs to the day before.
  const r = dayReplay(c, meal.start - 8 * 3600_000);
  const ev = r.scenario.events.find((e) => e.action.kind === "meal" && e.action.meal.protein === meal.protein);
  assert.ok(ev, "logged protein reaches the model");
  assert.ok(ev!.action.kind === "meal" && ev!.action.meal.carbs === meal.carbs && ev!.action.meal.fat === meal.fat);

  // Shanghai meals were written down as food and grams, with no carb count.
  const sh = unpack(person("shanghai-2015"));
  const sizes = new Set<number>();
  for (const day of [...new Set(sh.intervals.map((i) => Math.floor((i.start - 8 * 3600_000) / 86_400_000)))].slice(1, 6))
    for (const m of dayReplay(sh, day * 86_400_000 + 8 * 3600_000).meals) sizes.add(m.carbs);
  assert.ok(sizes.size > 3, `meal sizes vary with the rise: ${[...sizes]}`);
});

test("the blood-test baseline calls an ordinary adult ordinary (300 NHANES 2017-18 adults)", () => {
  const text = readFileSync(new URL("../data/published/nhanes_2017_2018/nhanes_2017_2018_fasting_adults_300.csv", import.meta.url), "utf8").trim().split("\n");
  const head = text[0].split(",");
  const COLS: [AnalyteId, string, string][] = [
    ["glucose", "glucose_mg_dl", "mg/dL"], ["insulin", "insulin_uU_ml", "µIU/mL"], ["hba1c", "hba1c_pct", "%"],
    ["creatinine", "creatinine_mg_dl", "mg/dL"], ["hemoglobin", "haemoglobin_g_dl", "g/dL"],
  ];
  const people = text.slice(1).map((line) => {
    const r = Object.fromEntries(line.split(",").map((v, i) => [head[i], v]));
    const labs = COLS.flatMap(([id, col, unit]) => (r[col] === "" ? [] : [labResult(id, +r[col], unit).result!]));
    const b = personalBaseline({ ...emptyData(), labs }, { age: +r.age_years, sex: r.sex as "female" | "male" });
    return { a1c: +r.hba1c_pct, ...b.params };
  });
  const groups = {
    "normal HbA1c": people.filter((p) => p.a1c < 5.7),
    prediabetes: people.filter((p) => p.a1c >= 5.7 && p.a1c < 6.5),
    diabetes: people.filter((p) => p.a1c >= 6.5),
  };
  const m = Object.fromEntries(Object.entries(groups).map(([k, g]) => [k, { n: g.length, is: median(g.map((p) => p.insulinSensitivity)), b: median(g.map((p) => p.betaCellResponse)), k: median(g.map((p) => p.kidneyClearance)), o: median(g.map((p) => p.oxygenCarrying)) }]));
  console.log("  median per group:", JSON.stringify(m));
  const normal = m["normal HbA1c"];
  for (const v of [normal.is, normal.b, normal.k, normal.o]) assert.ok(v > 0.85 && v < 1.15, JSON.stringify(normal));
  // Sensitivity falls as sugar control worsens, as clamp studies find (about half in type 2).
  assert.ok(normal.is > m.prediabetes.is && m.prediabetes.is > m.diabetes.is && m.diabetes.is > 0.4 && m.diabetes.is < 0.75, JSON.stringify(m));
  // Few people pinned at the ends of the scale.
  assert.ok(people.filter((p) => p.insulinSensitivity <= 0.25 || p.insulinSensitivity >= 2.5).length / people.length < 0.05);
});
