/**
 * Four-chamber heart with valves, on a closed two-circuit loop.
 *
 * Each chamber is a time-varying elastance, P = E(t) (V - V0). Each valve is a diode with a small
 * resistance. Systemic and pulmonary arteries and veins are single compliances joined by a
 * resistance. The body model owns heart rate, stroke volume and mean arterial pressure; this model
 * finds the beat those numbers imply. Systemic resistance follows from the body's pressure and
 * output, and the circulating stressed volume is solved so the stroke volume matches.
 *
 * Parameter values are representative of published lumped models of the adult circulation. They
 * were not read from a source file and are not fitted to a person.
 */
export const CHAMBERS = ["la", "lv", "ra", "rv"] as const;
export type Chamber = (typeof CHAMBERS)[number];
export const VALVES = ["mitral", "aortic", "tricuspid", "pulmonary"] as const;
export type Valve = (typeof VALVES)[number];
export const HEART_MODEL = "four-chamber-elastance-1";

export const HEART_PARAMETERS = {
  /** Peak and resting elastance, mmHg/mL, and unstressed volume, mL. */
  chambers: {
    la: { emax: 0.28, emin: 0.14, v0: 5 },
    lv: { emax: 2.6, emin: 0.075, v0: 10 },
    ra: { emax: 0.26, emin: 0.13, v0: 5 },
    rv: { emax: 0.75, emin: 0.045, v0: 10 },
  },
  /** Open-valve resistance, mmHg s/mL. */
  valves: { mitral: 0.008, aortic: 0.008, tricuspid: 0.006, pulmonary: 0.005 },
  /** Compliance, mL/mmHg. */
  compliance: { systemicArteries: 1.3, systemicVeins: 70, pulmonaryArteries: 4.2, pulmonaryVeins: 14 },
  /** Resistance, mmHg s/mL. Systemic resistance is set from the body state. */
  resistance: { pulmonary: 0.1, systemicVenousReturn: 0.012, pulmonaryVenousReturn: 0.008 },
  /** Central venous pressure assumed when deriving systemic resistance, mmHg. */
  centralVenousPressure: 5,
  /** Gain of peak ventricular elastance on sympathetic drive above its resting 0.15. */
  inotropy: 1.1,
} as const;

/** The body's operating point the beat has to reproduce. */
export type HeartPoint = { heartRate: number; strokeVolume: number; map: number; sympathetic: number };
export type HeartCycle = {
  point: HeartPoint;
  /** Samples over one beat, evenly spaced in phase; phase 0 is the start of ventricular contraction. */
  samples: number;
  volume: Record<Chamber, Float32Array>;
  pressure: Record<Chamber | "aorta" | "pulmonaryArtery", Float32Array>;
  /** 1 while a valve passes flow, else 0. */
  open: Record<Valve, Uint8Array>;
  /** Phase at which each valve opens and closes. */
  events: Record<Valve, { opens: number; closes: number }>;
  summary: {
    strokeVolume: number;
    rightStrokeVolume: number;
    endDiastolic: Record<Chamber, number>;
    endSystolic: Record<Chamber, number>;
    ejectionFraction: number;
    /** Share of left ventricular filling delivered while the atrium contracts. */
    atrialContribution: number;
    peak: Record<"lv" | "rv" | "aorta" | "pulmonaryArtery", number>;
    aorticDiastolic: number;
    meanArterial: number;
    leftVentricularEndDiastolicPressure: number;
    stressedVolume: number;
    /** False when no stressed volume in range reproduces the body's stroke volume. */
    matched: boolean;
  };
};

const SAMPLES = 240,
  STEPS = 2400;
/** Ventricular and atrial activation in [0, 1] at time t of a beat of period T, both in seconds. */
export function activation(t: number, period: number) {
  // Systole shortens with the square root of the period, as measured ejection times do.
  const root = Math.sqrt(period),
    rise = 0.28 * root,
    end = 0.42 * root,
    atrial = 0.16 * root,
    start = period - atrial;
  const ventricle =
    t < rise ? (1 - Math.cos((Math.PI * t) / rise)) / 2 : t < end ? (1 + Math.cos((Math.PI * (t - rise)) / (end - rise))) / 2 : 0;
  const atrium = t >= start ? (1 - Math.cos((2 * Math.PI * (t - start)) / atrial)) / 2 : 0;
  return { ventricle, atrium };
}

type Beat = { cycle: Omit<HeartCycle, "summary" | "events" | "point">; state: Float64Array; out: number; rightOut: number; atrialFill: number; fill: number; meanArterial: number };
/** State order: la, lv, ra, rv, systemic arteries, systemic veins, pulmonary arteries, pulmonary veins. */
function beat(point: HeartPoint, y: Float64Array, record: boolean): Beat {
  const p = HEART_PARAMETERS,
    period = 60 / point.heartRate,
    dt = period / STEPS;
  const gain = Math.max(0.5, 1 + p.inotropy * (point.sympathetic - 0.15));
  const systemic = Math.max(0.05, (point.map - p.centralVenousPressure) / ((point.heartRate * point.strokeVolume) / 60));
  const cycle = {
    samples: SAMPLES,
    volume: Object.fromEntries(CHAMBERS.map((k) => [k, new Float32Array(SAMPLES)])) as Beat["cycle"]["volume"],
    pressure: Object.fromEntries([...CHAMBERS, "aorta", "pulmonaryArtery"].map((k) => [k, new Float32Array(SAMPLES)])) as Beat["cycle"]["pressure"],
    open: Object.fromEntries(VALVES.map((k) => [k, new Uint8Array(SAMPLES)])) as Beat["cycle"]["open"],
  };
  let out = 0,
    rightOut = 0,
    fill = 0,
    atrialFill = 0,
    meanArterial = 0;
  for (let i = 0; i < STEPS; i++) {
    const a = activation(i * dt, period),
      c = p.chambers;
    const pla = (c.la.emin + (c.la.emax - c.la.emin) * a.atrium) * (y[0] - c.la.v0),
      plv = (c.lv.emin + (c.lv.emax * gain - c.lv.emin) * a.ventricle) * (y[1] - c.lv.v0),
      pra = (c.ra.emin + (c.ra.emax - c.ra.emin) * a.atrium) * (y[2] - c.ra.v0),
      prv = (c.rv.emin + (c.rv.emax * gain - c.rv.emin) * a.ventricle) * (y[3] - c.rv.v0),
      psa = y[4] / p.compliance.systemicArteries,
      psv = y[5] / p.compliance.systemicVeins,
      ppa = y[6] / p.compliance.pulmonaryArteries,
      ppv = y[7] / p.compliance.pulmonaryVeins;
    const mitral = Math.max(0, (pla - plv) / p.valves.mitral),
      aortic = Math.max(0, (plv - psa) / p.valves.aortic),
      tricuspid = Math.max(0, (pra - prv) / p.valves.tricuspid),
      pulmonary = Math.max(0, (prv - ppa) / p.valves.pulmonary),
      body = (psa - psv) / systemic,
      lungs = (ppa - ppv) / p.resistance.pulmonary,
      toRight = (psv - pra) / p.resistance.systemicVenousReturn,
      toLeft = (ppv - pla) / p.resistance.pulmonaryVenousReturn;
    if (record && i % (STEPS / SAMPLES) === 0) {
      const n = i / (STEPS / SAMPLES);
      CHAMBERS.forEach((k, j) => (cycle.volume[k][n] = y[j]));
      cycle.pressure.la[n] = pla;
      cycle.pressure.lv[n] = plv;
      cycle.pressure.ra[n] = pra;
      cycle.pressure.rv[n] = prv;
      cycle.pressure.aorta[n] = psa;
      cycle.pressure.pulmonaryArtery[n] = ppa;
      cycle.open.mitral[n] = mitral > 0 ? 1 : 0;
      cycle.open.aortic[n] = aortic > 0 ? 1 : 0;
      cycle.open.tricuspid[n] = tricuspid > 0 ? 1 : 0;
      cycle.open.pulmonary[n] = pulmonary > 0 ? 1 : 0;
    }
    y[0] += (toLeft - mitral) * dt;
    y[1] += (mitral - aortic) * dt;
    y[2] += (toRight - tricuspid) * dt;
    y[3] += (tricuspid - pulmonary) * dt;
    y[4] += (aortic - body) * dt;
    y[5] += (body - toRight) * dt;
    y[6] += (pulmonary - lungs) * dt;
    y[7] += (lungs - toLeft) * dt;
    out += aortic * dt;
    rightOut += pulmonary * dt;
    fill += mitral * dt;
    if (a.atrium > 0) atrialFill += mitral * dt;
    meanArterial += psa / STEPS;
  }
  return { cycle, state: y, out, rightOut, fill, atrialFill, meanArterial };
}
/** Runs beats from a standing start until successive strokes agree, then records one. */
function settle(point: HeartPoint, stressedVolume: number) {
  const c = HEART_PARAMETERS.compliance,
    chambers = [60, 120, 60, 120],
    held = chambers.reduce((a, b) => a + b, 0),
    scale = Math.min(1, (0.5 * stressedVolume) / held),
    rest = stressedVolume - held * scale,
    total = c.systemicArteries + c.systemicVeins + c.pulmonaryArteries + c.pulmonaryVeins;
  const y = Float64Array.from([
    ...chambers.map((v) => v * scale),
    ...[c.systemicArteries, c.systemicVeins, c.pulmonaryArteries, c.pulmonaryVeins].map((k) => (rest * k) / total),
  ]);
  let last = -1;
  for (let n = 0; n < 80; n++) {
    const b = beat(point, y, false);
    if (Math.abs(b.out - last) < 0.02 && Math.abs(b.out - b.rightOut) < 0.05) break;
    last = b.out;
  }
  return beat(point, y, true);
}
const edges = (open: Uint8Array) => {
  let opens = -1,
    closes = -1;
  for (let i = 0; i < open.length; i++) {
    const before = open[(i + open.length - 1) % open.length];
    if (open[i] && !before) opens = i / open.length;
    if (!open[i] && before) closes = i / open.length;
  }
  return { opens, closes };
};
const cache = new Map<string, HeartCycle>();
/** The steady beat for an operating point. Points are rounded, and results are kept. */
export function heartCycle(raw: HeartPoint): HeartCycle {
  const point = {
    heartRate: Math.min(220, Math.max(30, Math.round(raw.heartRate))),
    strokeVolume: Math.min(160, Math.max(15, Math.round(raw.strokeVolume))),
    map: Math.min(200, Math.max(30, Math.round(raw.map / 2) * 2)),
    sympathetic: Math.round(Math.min(1.5, Math.max(0, raw.sympathetic)) * 20) / 20,
  };
  const key = `${point.heartRate}:${point.strokeVolume}:${point.map}:${point.sympathetic}`,
    kept = cache.get(key);
  if (kept) return kept;
  // Stroke volume rises with stressed volume, so bisect on it.
  let low = 250,
    high = 3500,
    best = settle(point, (low + high) / 2),
    volume = (low + high) / 2;
  for (let i = 0; i < 16 && Math.abs(best.out - point.strokeVolume) > 0.1; i++) {
    if (best.out < point.strokeVolume) low = volume;
    else high = volume;
    volume = (low + high) / 2;
    best = settle(point, volume);
  }
  const { volume: v, pressure, open } = best.cycle,
    max = (a: Float32Array) => a.reduce((m, x) => Math.max(m, x), -Infinity),
    min = (a: Float32Array) => a.reduce((m, x) => Math.min(m, x), Infinity),
    each = (pick: (a: Float32Array) => number) => Object.fromEntries(CHAMBERS.map((k) => [k, pick(v[k])])) as Record<Chamber, number>;
  const cycle: HeartCycle = {
    point,
    ...best.cycle,
    events: Object.fromEntries(VALVES.map((k) => [k, edges(open[k])])) as HeartCycle["events"],
    summary: {
      strokeVolume: best.out,
      rightStrokeVolume: best.rightOut,
      endDiastolic: each(max),
      endSystolic: each(min),
      ejectionFraction: best.out / max(v.lv),
      atrialContribution: best.fill > 0 ? best.atrialFill / best.fill : 0,
      peak: { lv: max(pressure.lv), rv: max(pressure.rv), aorta: max(pressure.aorta), pulmonaryArtery: max(pressure.pulmonaryArtery) },
      aorticDiastolic: min(pressure.aorta),
      meanArterial: best.meanArterial,
      leftVentricularEndDiastolicPressure: pressure.lv[0],
      stressedVolume: volume,
      matched: Math.abs(best.out - point.strokeVolume) <= 0.5,
    },
  };
  if (cache.size > 400) cache.clear();
  cache.set(key, cycle);
  return cycle;
}
/** Linear sample of a recorded trace at a phase in [0, 1). */
export function atPhase(trace: Float32Array, phase: number) {
  const x = (((phase % 1) + 1) % 1) * trace.length,
    i = Math.floor(x),
    j = (i + 1) % trace.length;
  return trace[i] + (trace[j] - trace[i]) * (x - i);
}
