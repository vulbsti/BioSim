/**
 * Blood test results: what each value is, its standard unit and the units labs also use, a typical
 * adult range, and which parts of the body it speaks to. Values come in typed, pasted from a report,
 * or as a FHIR bundle of Observations (LOINC coded).
 *
 * Ranges are typical for adults and are shown only as "compared with typical". Labs and sexes differ,
 * and none of this is a diagnosis.
 */
import type { Organ } from "../simulation/types";
import { number, parseTime, type Imported, type LabResult } from "./data";

type Analyte = {
  name: string;
  /** Other names seen on reports, lower case. */
  aliases: string[];
  loinc: string[];
  unit: string;
  /** Other units, as a factor to the standard unit or a function. Keys are normalised (see unitKey). */
  units: Record<string, number | ((v: number) => number)>;
  typical: [number, number];
  organs: Organ[];
  /** One plain sentence on what it says about the body. */
  says: string;
};

export const ANALYTES = {
  glucose: {
    name: "Fasting glucose",
    aliases: ["fasting glucose", "glucose fasting", "fasting plasma glucose", "fpg", "glucose"],
    loinc: ["1558-6", "2345-7", "2339-0"],
    unit: "mg/dL",
    units: { "mmol/l": 18.016 },
    typical: [70, 99],
    organs: ["liver", "endocrine"],
    says: "How much sugar is in your blood after a night without food, set mostly by your liver and insulin.",
  },
  hba1c: {
    name: "HbA1c",
    aliases: ["hba1c", "a1c", "glycated haemoglobin", "glycated hemoglobin", "hemoglobin a1c", "haemoglobin a1c"],
    loinc: ["4548-4", "17856-6", "59261-8"],
    unit: "%",
    // IFCC mmol/mol to NGSP %.
    units: { "mmol/mol": (v) => v * 0.09148 + 2.152 },
    typical: [4, 5.6],
    organs: ["endocrine", "muscle", "liver"],
    says: "Your average blood sugar over the last two to three months.",
  },
  insulin: {
    name: "Fasting insulin",
    aliases: ["fasting insulin", "insulin fasting", "insulin"],
    loinc: ["20448-7", "27873-9"],
    unit: "µIU/mL",
    units: { "miu/l": 1, "mu/l": 1, "pmol/l": 1 / 6 },
    typical: [2, 15],
    organs: ["endocrine", "muscle", "adipose"],
    says: "How hard your pancreas works to keep fasting sugar where it is. High insulin for normal sugar means the body responds to it slowly.",
  },
  triglycerides: {
    name: "Triglycerides",
    aliases: ["triglycerides", "triglyceride", "trig", "tg"],
    loinc: ["2571-8", "1644-4"],
    unit: "mg/dL",
    units: { "mmol/l": 88.57 },
    typical: [40, 150],
    organs: ["liver", "adipose"],
    says: "Fat carried in the blood, made by the liver and taken from meals.",
  },
  hdl: {
    name: "HDL cholesterol",
    aliases: ["hdl cholesterol", "hdl-c", "hdl", "high density lipoprotein"],
    loinc: ["2085-9"],
    unit: "mg/dL",
    units: { "mmol/l": 38.67 },
    typical: [40, 90],
    organs: ["liver"],
    says: "Cholesterol carried back from the body to the liver.",
  },
  ldl: {
    name: "LDL cholesterol",
    aliases: ["ldl cholesterol", "ldl-c", "ldl", "low density lipoprotein"],
    loinc: ["13457-7", "2089-1", "18262-6"],
    unit: "mg/dL",
    units: { "mmol/l": 38.67 },
    typical: [50, 130],
    organs: ["liver"],
    says: "Cholesterol carried from the liver out to the body.",
  },
  cholesterol: {
    name: "Total cholesterol",
    aliases: ["total cholesterol", "cholesterol total", "cholesterol"],
    loinc: ["2093-3"],
    unit: "mg/dL",
    units: { "mmol/l": 38.67 },
    typical: [120, 200],
    organs: ["liver"],
    says: "All the cholesterol in the blood together.",
  },
  tsh: {
    name: "TSH",
    aliases: ["tsh", "thyroid stimulating hormone", "thyrotropin"],
    loinc: ["3016-3", "11580-8"],
    unit: "mIU/L",
    units: { "µiu/ml": 1, "mu/l": 1, "miu/ml": 1000 },
    typical: [0.4, 4],
    organs: ["endocrine", "brain"],
    says: "The brain's signal to the thyroid. High means the thyroid is being pushed harder.",
  },
  ft4: {
    name: "Free T4",
    aliases: ["free t4", "ft4", "free thyroxine", "thyroxine free"],
    loinc: ["3024-7"],
    unit: "ng/dL",
    units: { "pmol/l": 1 / 12.87 },
    typical: [0.8, 1.8],
    organs: ["endocrine"],
    says: "Thyroid hormone in the blood, which sets how fast cells burn fuel.",
  },
  crp: {
    name: "CRP",
    aliases: ["hs-crp", "hscrp", "high sensitivity crp", "c-reactive protein", "c reactive protein", "crp"],
    loinc: ["1988-5", "30522-7"],
    unit: "mg/L",
    units: { "mg/dl": 10 },
    typical: [0, 3],
    organs: ["liver"],
    says: "A protein the liver makes when there is inflammation somewhere in the body.",
  },
  creatinine: {
    name: "Creatinine",
    aliases: ["creatinine", "serum creatinine", "creat"],
    loinc: ["2160-0", "38483-4"],
    unit: "mg/dL",
    units: { "µmol/l": 1 / 88.42 },
    typical: [0.6, 1.2],
    organs: ["kidneys", "muscle"],
    says: "A waste product of muscle that the kidneys filter out.",
  },
  egfr: {
    name: "eGFR",
    aliases: ["egfr", "estimated gfr", "glomerular filtration rate", "gfr"],
    loinc: ["98979-8", "62238-1", "33914-3"],
    unit: "mL/min/1.73m²",
    units: { "ml/min": 1 },
    typical: [90, 120],
    organs: ["kidneys"],
    says: "How much blood your kidneys clean each minute.",
  },
  alt: {
    name: "ALT",
    aliases: ["alt", "sgpt", "alanine aminotransferase", "alanine transaminase"],
    loinc: ["1742-6", "1743-4"],
    unit: "U/L",
    units: { "iu/l": 1 },
    typical: [7, 45],
    organs: ["liver"],
    says: "An enzyme that leaks from liver cells when they are under strain.",
  },
  ast: {
    name: "AST",
    aliases: ["ast", "sgot", "aspartate aminotransferase", "aspartate transaminase"],
    loinc: ["1920-8"],
    unit: "U/L",
    units: { "iu/l": 1 },
    typical: [10, 40],
    organs: ["liver", "muscle", "heart"],
    says: "An enzyme from liver, muscle and heart cells.",
  },
  hemoglobin: {
    name: "Haemoglobin",
    aliases: ["haemoglobin", "hemoglobin", "hgb", "hb"],
    loinc: ["718-7"],
    unit: "g/dL",
    units: { "g/l": 0.1, "mmol/l": 1.611 },
    typical: [12, 17],
    organs: ["lungs", "heart"],
    says: "The protein in red blood cells that carries oxygen.",
  },
  ferritin: {
    name: "Ferritin",
    aliases: ["ferritin"],
    loinc: ["2276-4"],
    unit: "ng/mL",
    units: { "µg/l": 1 },
    typical: [20, 300],
    organs: ["liver"],
    says: "The body's iron store, which red blood cells are made from.",
  },
} satisfies Record<string, Analyte>;
export type AnalyteId = keyof typeof ANALYTES;
const IDS = Object.keys(ANALYTES) as AnalyteId[];

/** Lower case, no spaces, µ for u or mc, 2 for ²: "umol/L" and "µmol / l" both become "µmol/l". */
export const unitKey = (u: string) =>
  u.trim().toLowerCase().replace(/\s+/g, "").replace(/μ/g, "µ").replace(/^(u|mc)(?=[a-z])/, "µ").replace(/²/g, "2");

/** Converts a value to the analyte's standard unit; NaN if the unit is unknown for it. */
export function toStandard(id: AnalyteId, value: number, unit: string): number {
  const a: Analyte = ANALYTES[id];
  const key = unitKey(unit);
  if (key === "" || key === unitKey(a.unit)) return value;
  const f = a.units[key];
  if (f === undefined) return NaN;
  return typeof f === "number" ? value * f : f(value);
}

/** Which analyte a name on a report means. Longer aliases win, so "fasting insulin" beats "insulin". */
export function analyteFor(name: string): AnalyteId | null {
  const n = name.trim().toLowerCase();
  let best: [AnalyteId, number] | null = null;
  for (const id of IDS)
    for (const alias of ANALYTES[id].aliases as string[])
      if ((n === alias || new RegExp(`(^|[^a-z0-9])${escape(alias)}([^a-z0-9]|$)`).test(n)) && (!best || alias.length > best[1]))
        best = [id, alias.length];
  return best?.[0] ?? null;
}
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export function analyteForLoinc(code: string): AnalyteId | null {
  return IDS.find((id) => (ANALYTES[id].loinc as string[]).includes(code)) ?? null;
}

/** One typed value. Returns null and a reason when it cannot be used. */
export function labResult(
  id: AnalyteId,
  value: number,
  unit: string,
  source = "Typed",
  at?: number,
): { result: LabResult | null; warning?: string } {
  const v = toStandard(id, value, unit);
  const a: Analyte = ANALYTES[id];
  if (!Number.isFinite(v))
    return { result: null, warning: `${a.name}: the unit "${unit}" is not one this knows. Use ${[a.unit, ...Object.keys(a.units)].join(", ")}.` };
  const result: LabResult = { analyte: id, value: v, entered: { value, unit: unit || a.unit }, source, ...(at === undefined ? {} : { at }) };
  // A value ten times past the typical range is most often the wrong unit.
  const [lo, hi] = a.typical;
  const warning = v > hi * 10 || (lo > 0 && v < lo / 10) ? `${a.name} ${value} ${unit || a.unit} is far from typical; check the unit.` : undefined;
  return { result, warning };
}

/**
 * Reads results pasted from a report, one per line: a name, a number, and a unit ("HbA1c 5.9 %",
 * "Glucose, fasting: 5.4 mmol/L"). Lines with no known name are skipped.
 */
export function parsePanelText(text: string, source = "Pasted report"): Imported {
  const labs: LabResult[] = [],
    warnings: string[] = [];
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^(.*?)[\s:=,]+([<>]?\s*\d+(?:[.,]\d+)?)\s*([a-zA-Zµμ%/.²0-9\s]*?)(?:\s{2,}|\s*\(|\s*[\d.,]+\s*[-–]\s*[\d.,]+|$)/);
    if (!m) continue;
    const id = analyteFor(m[1]);
    if (!id) continue;
    const value = number(m[2].replace(/[<>\s]/g, ""));
    const { result, warning } = labResult(id, value, m[3].trim(), source);
    if (result) labs.push(result);
    if (warning) warnings.push(warning);
  }
  if (!labs.length) warnings.push("No known blood test values were found.");
  return { source, series: [], intervals: [], labs, warnings };
}

type FhirObservation = {
  resourceType?: string;
  code?: { coding?: { system?: string; code?: string; display?: string }[]; text?: string };
  valueQuantity?: { value?: number; unit?: string; code?: string };
  effectiveDateTime?: string;
};

/** A FHIR Bundle (or array) of Observation resources, matched by LOINC code, then by name. */
export function parseFhir(json: string, source = "FHIR"): Imported {
  const labs: LabResult[] = [],
    warnings: string[] = [];
  let doc: unknown;
  try {
    doc = JSON.parse(json);
  } catch {
    return { source, series: [], intervals: [], labs, warnings: ["The file is not valid JSON."] };
  }
  const entries: FhirObservation[] = Array.isArray(doc)
    ? doc
    : ((doc as { entry?: { resource?: FhirObservation }[] }).entry ?? []).map((e) => e.resource ?? {});
  for (const o of entries) {
    if (o.resourceType !== "Observation" || !o.valueQuantity || typeof o.valueQuantity.value !== "number") continue;
    const coding = o.code?.coding ?? [];
    const id =
      coding.map((c) => (c.system?.includes("loinc") ? analyteForLoinc(c.code ?? "") : null)).find(Boolean) ??
      analyteFor(o.code?.text ?? coding[0]?.display ?? "");
    if (!id) continue;
    const at = o.effectiveDateTime ? parseTime(o.effectiveDateTime) : undefined;
    const { result, warning } = labResult(id, o.valueQuantity.value, o.valueQuantity.unit ?? o.valueQuantity.code ?? "", source, Number.isFinite(at) ? at : undefined);
    if (result) labs.push(result);
    if (warning) warnings.push(warning);
  }
  if (!labs.length) warnings.push("No known blood test Observations were found.");
  return { source, series: [], intervals: [], labs, warnings };
}

/** Where a value sits against typical: below 0 under the range, 0 to 1 inside, above 1 over it. */
export function position(r: LabResult) {
  const [lo, hi] = ANALYTES[r.analyte as AnalyteId].typical;
  return (r.value - lo) / (hi - lo);
}

/** The newest result for each analyte. */
export function latest(labs: LabResult[]): Partial<Record<AnalyteId, LabResult>> {
  const out: Partial<Record<AnalyteId, LabResult>> = {};
  for (const l of labs) {
    const id = l.analyte as AnalyteId,
      prev = out[id];
    if (!prev || (l.at ?? -Infinity) >= (prev.at ?? -Infinity)) out[id] = l;
  }
  return out;
}

/**
 * eGFR from creatinine, age and sex by the 2021 CKD-EPI equation (no race term), in mL/min/1.73m².
 */
export function egfrFromCreatinine(creatinine: number, age: number, sex: "female" | "male") {
  const k = sex === "female" ? 0.7 : 0.9,
    a = sex === "female" ? -0.241 : -0.302;
  const r = creatinine / k;
  return 142 * Math.min(r, 1) ** a * Math.max(r, 1) ** -1.2 * 0.9938 ** age * (sex === "female" ? 1.012 : 1);
}
