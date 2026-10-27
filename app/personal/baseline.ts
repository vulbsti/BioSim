/**
 * Turns measurements into the body model's personal parameters, each with the reason for it.
 *
 * Every parameter is a multiple of a typical adult (1 = typical) except restingHeartRate (bpm) and
 * autonomicTone (-1 calm and vagal to +1 sympathetic, 0 typical). The engine reads these from
 * BodyState.params. These are rough, deliberately: the aim is the right direction and size, so that
 * the picture of the body leans the way the person's numbers lean.
 */
import type { Organ } from "../simulation/types";
import { DAY, readings, type PersonalData, type Point } from "./data";
import { ANALYTES, egfrFromCreatinine, latest, position, type AnalyteId } from "./panel";

/** Keep in step with PersonalBaseline in app/simulation/types.ts (engine thread). */
export type PersonalBaseline = {
  insulinSensitivity: number;
  betaCellResponse: number;
  metabolicRate: number;
  kidneyClearance: number;
  oxygenCarrying: number;
  restingHeartRate: number;
  autonomicTone: number;
};
export const TYPICAL: PersonalBaseline = {
  insulinSensitivity: 1,
  betaCellResponse: 1,
  metabolicRate: 1,
  kidneyClearance: 1,
  oxygenCarrying: 1,
  restingHeartRate: 72,
  autonomicTone: 0,
};
export type Profile = { age?: number; sex?: "female" | "male" };

/** Why a parameter has the value it has, in words a person can read, and what it came from. */
export type Reason = { why: string; from: string[]; confidence: "good" | "rough" };
/** A tint on one organ: above 0 means more than typical (or more strain), below 0 less. */
export type Tint = { organ: Organ; level: number; why: string; from: string[] };
export type Baseline = {
  params: PersonalBaseline;
  reasons: Partial<Record<keyof PersonalBaseline, Reason>>;
  tints: Tint[];
  /** Organs no measurement speaks to yet, so the person can see what is missing. */
  missing: Organ[];
};

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const median = (v: number[]) => {
  if (!v.length) return NaN;
  const s = [...v].sort((a, b) => a - b),
    m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const round = (v: number, d = 2) => Math.round(v * 10 ** d) / 10 ** d;
const name = (id: AnalyteId) => ANALYTES[id].name;

/** Typical resting heart rate variability for a healthy adult, in ms (falls with age). */
export const typicalHrv = (method: "rmssd" | "sdnn", age = 35) =>
  (method === "rmssd" ? 42 : 50) * clamp(1 - (age - 35) * 0.012, 0.5, 1.4);

/**
 * Builds the baseline from whatever is there. Only the last 30 days of band data are used, so an old
 * export does not describe today's body.
 */
export function personalBaseline(data: PersonalData, profile: Profile = {}): Baseline {
  const params = { ...TYPICAL },
    reasons: Baseline["reasons"] = {},
    tints: Tint[] = [];
  const lab = latest(data.labs);
  const v = (id: AnalyteId) => lab[id]?.value;

  // Sugar handling. HOMA from fasting glucose and insulin when both are there, HbA1c as a weak stand-in.
  const glucose = v("glucose"),
    insulin = v("insulin"),
    a1c = v("hba1c");
  if (glucose !== undefined && insulin !== undefined) {
    const homaIR = (glucose * insulin) / 405;
    const homaB = (20 * insulin) / Math.max(0.5, glucose / 18.016 - 3.5);
    params.insulinSensitivity = round(clamp(1 / homaIR, 0.2, 2.5));
    params.betaCellResponse = round(clamp(homaB / 100, 0.2, 3));
    reasons.insulinSensitivity = {
      why: params.insulinSensitivity < 0.8
        ? "Your fasting insulin is high for your fasting sugar, so muscles and fat are drawn as slow to take up sugar."
        : params.insulinSensitivity > 1.25
          ? "Little insulin keeps your fasting sugar steady, so muscles and fat take up sugar readily."
          : "Your fasting sugar and insulin are in typical balance.",
      from: [name("glucose"), name("insulin")],
      confidence: "good",
    };
    reasons.betaCellResponse = {
      why: `Your pancreas makes about ${Math.round(homaB)}% of the typical insulin for your fasting sugar.`,
      from: [name("glucose"), name("insulin")],
      confidence: "good",
    };
  } else if (a1c !== undefined) {
    params.insulinSensitivity = round(clamp(1 - (a1c - 5.3) * 0.35, 0.3, 1.3));
    reasons.insulinSensitivity = {
      why: a1c > 5.6
        ? "Your average sugar over recent months is above typical, so sugar is drawn as clearing a little slowly. A fasting insulin test would make this firmer."
        : "Your average sugar over recent months is typical.",
      from: [name("hba1c")],
      confidence: "rough",
    };
  }
  if (params.insulinSensitivity !== 1) {
    const level = round(clamp(1 - params.insulinSensitivity, -1, 1));
    tints.push({ organ: "muscle", level: -level, why: reasons.insulinSensitivity!.why, from: reasons.insulinSensitivity!.from });
  }
  if (params.betaCellResponse !== 1)
    tints.push({ organ: "endocrine", level: round(clamp(params.betaCellResponse - 1, -1, 1)), why: reasons.betaCellResponse!.why, from: reasons.betaCellResponse!.from });

  // Thyroid: free T4 sets the burn rate; TSH alone is read backwards (a high TSH means a slow thyroid).
  const ft4 = v("ft4"),
    tsh = v("tsh");
  if (ft4 !== undefined) {
    params.metabolicRate = round(clamp(1 + 0.3 * ((ft4 - 1.3) / 0.5), 0.7, 1.35));
    reasons.metabolicRate = { why: rateWhy(params.metabolicRate), from: [name("ft4")], confidence: "good" };
  } else if (tsh !== undefined) {
    params.metabolicRate = round(clamp(1 - 0.08 * Math.log2(tsh / 1.5), 0.75, 1.25));
    reasons.metabolicRate = { why: rateWhy(params.metabolicRate), from: [name("tsh")], confidence: "rough" };
  }

  // Kidneys: eGFR as given, else worked out from creatinine, else roughly from creatinine alone.
  let egfr = v("egfr"),
    egfrFrom = [name("egfr")],
    sure: Reason["confidence"] = "good";
  const creat = v("creatinine");
  if (egfr === undefined && creat !== undefined) {
    egfrFrom = [name("creatinine")];
    if (profile.age !== undefined && profile.sex) egfr = egfrFromCreatinine(creat, profile.age, profile.sex);
    else (egfr = 100 * (0.9 / creat)), (sure = "rough");
  }
  if (egfr !== undefined) {
    params.kidneyClearance = round(clamp(egfr / 100, 0.1, 1.3));
    reasons.kidneyClearance = {
      why: `Your kidneys clean about ${Math.round(egfr)} mL of blood a minute; about 100 is typical.`,
      from: egfrFrom,
      confidence: sure,
    };
    tints.push({ organ: "kidneys", level: round(clamp(params.kidneyClearance - 1, -1, 1)), why: reasons.kidneyClearance.why, from: egfrFrom });
  }

  const hb = v("hemoglobin");
  if (hb !== undefined) {
    params.oxygenCarrying = round(clamp(hb / 14.5, 0.4, 1.4));
    reasons.oxygenCarrying = {
      why: `Each litre of your blood carries about ${Math.round(params.oxygenCarrying * 100)}% of the typical oxygen.`,
      from: [name("hemoglobin")],
      confidence: "good",
    };
  }

  // Liver strain and blood fats only tint; the engine has no parameter for them yet.
  const liver = (["alt", "ast", "triglycerides", "crp"] as AnalyteId[]).filter((id) => lab[id] && position(lab[id]!) > 1);
  if (liver.length)
    tints.push({
      organ: "liver",
      level: round(clamp(Math.max(...liver.map((id) => position(lab[id]!) - 1)), 0, 1)),
      why: `Your ${liver.map(name).join(", ")} ${liver.length > 1 ? "are" : "is"} above typical, a sign the liver is working harder.`,
      from: liver.map(name),
    });

  // The band: resting heart rate and HRV from the last 30 days.
  const until = Math.max(-Infinity, ...data.series.flatMap((s) => (s.points.length ? [s.points.at(-1)!.t] : [])));
  const since = until - 30 * DAY;
  const rhr = median(readings(data, "restingHeartRate", since).map((p) => p.v));
  const night = nightLow(readings(data, "heartRate", since));
  if (Number.isFinite(rhr) || Number.isFinite(night)) {
    params.restingHeartRate = Math.round(clamp(Number.isFinite(rhr) ? rhr : night, 35, 110));
    reasons.restingHeartRate = {
      why: `Your heart rests at about ${params.restingHeartRate} beats a minute.`,
      from: [Number.isFinite(rhr) ? "Resting heart rate from your band" : "Lowest heart rates from your band"],
      confidence: Number.isFinite(rhr) ? "good" : "rough",
    };
  }
  const rmssd = median(readings(data, "hrvRmssd", since).map((p) => p.v)),
    sdnn = median(readings(data, "hrvSdnn", since).map((p) => p.v));
  const [hrv, method] = Number.isFinite(rmssd) ? [rmssd, "rmssd" as const] : [sdnn, "sdnn" as const];
  if (Number.isFinite(hrv)) {
    // Each halving of HRV against typical moves the balance 0.6 toward the stress side.
    params.autonomicTone = round(clamp(-0.6 * Math.log2(hrv / typicalHrv(method, profile.age)), -1, 1));
    reasons.autonomicTone = {
      why: params.autonomicTone < -0.15
        ? "Your heart rate varies a lot from beat to beat, a sign the calming vagus nerve is active."
        : params.autonomicTone > 0.15
          ? "Your heart rate varies little from beat to beat, a sign the body is leaning toward its stress response."
          : "The calming and stress sides of your nervous system are in typical balance.",
      from: [`Heart rate variability (${method.toUpperCase()}) from your band`],
      confidence: "good",
    };
  }
  if (params.autonomicTone !== 0 || params.restingHeartRate !== TYPICAL.restingHeartRate) {
    const r = reasons.autonomicTone ?? reasons.restingHeartRate!;
    tints.push({ organ: "heart", level: round(clamp((params.restingHeartRate - 72) / 30, -1, 1)), why: r.why, from: r.from });
  }

  const spoken = new Set<Organ>([
    ...tints.map((t) => t.organ),
    ...Object.keys(lab).flatMap((id) => ANALYTES[id as AnalyteId].organs as Organ[]),
  ]);
  if (data.series.some((s) => s.kind === "glucose")) spoken.add("liver").add("gut").add("muscle");
  if (data.series.some((s) => s.kind === "heartRate" || s.kind === "restingHeartRate")) spoken.add("heart");
  if (data.series.some((s) => s.kind === "spo2" || s.kind === "respiratoryRate")) spoken.add("lungs");
  if (data.series.some((s) => s.kind === "steps")) spoken.add("muscle");
  const ORGANS: Organ[] = ["heart", "lungs", "brain", "liver", "gut", "kidneys", "muscle", "skin", "adipose", "endocrine"];
  return { params, reasons, tints, missing: ORGANS.filter((o) => !spoken.has(o)) };
}

const rateWhy = (r: number) =>
  r < 0.92
    ? "Your thyroid numbers point to a slower burn: cells use fuel and oxygen a little more slowly."
    : r > 1.08
      ? "Your thyroid numbers point to a faster burn: cells use fuel and oxygen a little faster."
      : "Your thyroid numbers point to a typical rate of burning fuel.";

/** Resting heart rate from raw heart rate: the median of each night's lowest half hour (00:00 to 06:00). */
function nightLow(points: Point[]) {
  const nights = new Map<number, number[]>();
  for (const p of points) {
    const hour = (p.t % DAY) / 3_600_000;
    if (hour >= 6) continue;
    const day = Math.floor(p.t / DAY);
    if (!nights.has(day)) nights.set(day, []);
    nights.get(day)!.push(p.v);
  }
  const lows = [...nights.values()]
    .filter((v) => v.length >= 6)
    .map((v) => median([...v].sort((a, b) => a - b).slice(0, Math.max(3, Math.round(v.length / 12)))));
  return median(lows);
}
