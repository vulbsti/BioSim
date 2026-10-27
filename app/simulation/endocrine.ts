import {HORMONES, type BodyState, type Hormone} from './types';
import {BLOOD_COMPARTMENTS, bloodEdges, concentration} from './transport';

/**
 * Each hormone in plain words: the gland that releases it, the blood it is released into, how long
 * it lasts in blood (`tau`, minutes) and what it does. `drain` is the blood compartment of
 * the gland's vein: the pancreas and gut drain into the portal vein, the adrenals beside the renal
 * veins, the pituitary, pineal and thyroid into the veins of the head and neck.
 */
export const hormoneInfo: Record<Hormone, {name: string; gland: string; drain: string; tau: number; does: string}> = {
  insulin: {name: 'Insulin', gland: 'Pancreas', drain: 'gut-blood', tau: 6,
    does: 'Released when blood sugar rises. Muscle, liver and fat take sugar in and store it.'},
  glucagon: {name: 'Glucagon', gland: 'Pancreas', drain: 'gut-blood', tau: 8,
    does: 'Released when blood sugar falls. The liver breaks down its stored sugar and releases it.'},
  glp1: {name: 'GLP-1', gland: 'Small intestine', drain: 'gut-blood', tau: 4,
    does: 'Released as food is absorbed. Makes the pancreas release more insulin and slows the stomach.'},
  epinephrine: {name: 'Adrenaline', gland: 'Adrenal glands', drain: 'kidneys-blood', tau: 2,
    does: 'Released in stress and exercise. Speeds the heart and makes the liver release sugar.'},
  cortisol: {name: 'Cortisol', gland: 'Adrenal glands', drain: 'kidneys-blood', tau: 65,
    does: 'Highest in the morning, raised by stress. The liver makes new sugar from protein.'},
  thyroid: {name: 'Thyroid hormone', gland: 'Thyroid', drain: 'brain-blood', tau: 1440,
    does: 'Sets how fast every cell burns fuel. Changes over weeks, not minutes.'},
  adh: {name: 'ADH (vasopressin)', gland: 'Pituitary', drain: 'brain-blood', tau: 12,
    does: 'Released when blood is concentrated. The kidneys hold on to water and make less urine.'},
  aldosterone: {name: 'Aldosterone', gland: 'Adrenal glands', drain: 'kidneys-blood', tau: 35,
    does: 'Released when blood volume or pressure is low. The kidneys hold on to salt.'},
  melatonin: {name: 'Melatonin', gland: 'Pineal gland', drain: 'brain-blood', tau: 35,
    does: 'Released in the dark hours of the night, most when asleep. Tells the body it is night.'},
};

/** The clock time when a run starts (simulated time 0). */
export const CLOCK_START_HOUR = 8;
export const clockHour = (s: BodyState) => (CLOCK_START_HOUR + s.time / 3600) % 24;

export const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));
export const relax = (x: number, target: number, dt: number, tau: number) => x + (target - x) * -Math.expm1(-dt / tau);

/** Sympathetic drive at this person's resting tone. */
export const restingSympathetic = (s: BodyState) => 0.15 + 0.12 * s.params.autonomicTone;
/** Sympathetic drive above this person's rest: 0 when calm. */
export const arousal = (s: BodyState) => Math.max(0, s.sympathetic - restingSympathetic(s));
/** Kidney renin drive (renin, angiotensin): low pressure, low volume and stress raise it. 1 at rest. */
export const reninDrive = (s: BodyState) =>
  clamp(1 + (93 - s.map) * 0.045 + (1 - s.plasma / 3000) * 12 + arousal(s), 0.1, 8);

/** Daily cortisol rhythm: 1 at its 08:00 peak, about a third at midnight. */
const cortisolRhythm = (hour: number) => {
  const d = Math.min(Math.abs(hour - 8), 24 - Math.abs(hour - 8));
  return 0.2 + 0.8 * Math.exp(-((d / 6) ** 2));
};
/** 0 by day to 1 at 03:00, the dark hours when the pineal releases melatonin. */
const darkness = (hour: number) => clamp((Math.cos(((hour - 3) * Math.PI) / 12) - 0.3) / 0.7, 0, 1);

/** How strongly each gland is driven now, against its resting release (1). */
export function releaseDrive(s: BodyState): Record<Hormone, number> {
  const h = s.hormones,
    g = concentration(s.transport.compartments.arterial, 'glucose') * 100000,
    hour = clockHour(s),
    stress = arousal(s),
    low = Math.max(0, (70 - g) / 10),
    volume = s.plasma / 3000,
    absorbed = s.digestionRates;
  return {
    insulin: clamp(s.params.betaCellResponse * (1 + (g - 90) / 50) * (1 + 0.25 * (h.glp1 - 1)) - stress * 0.4, 0.08, 12),
    glucagon: clamp(1 + (90 - g) / 30 + 0.3 * absorbed.protein + 0.3 * stress + low - 0.18 * (h.insulin - 1), 0.15, 6),
    glp1: 1 + absorbed.carbs * 2 + (absorbed.protein + absorbed.fat) * 1.5,
    epinephrine: 1 + stress * 8 + low * 2,
    cortisol: cortisolRhythm(hour) * (1 + stress * 2.5 + low),
    thyroid: s.params.metabolicRate,
    adh: clamp(1 + (s.osmolarity - 285) * 0.22 + (1 - volume) * 18, 0.08, 12),
    aldosterone: reninDrive(s),
    melatonin: 1 + 9 * darkness(hour) * (0.3 + 0.7 * s.inputs.sleep),
  };
}

/** First-order loss per minute in each blood compartment; the liver and kidneys clear extra. */
function clearance(h: Hormone, compartment: string) {
  const base = 1 / hormoneInfo[h].tau;
  // About half the insulin reaching the liver is removed on first pass, a quarter of the glucagon.
  if (compartment === 'liver-blood' && h === 'insulin') return base + 4.5;
  if (compartment === 'liver-blood' && h === 'glucagon') return base + 1.5;
  if (compartment === 'kidneys-blood' && h === 'insulin') return base + 0.5;
  return base;
}

/**
 * Concentration in every blood compartment when the gland releases one unit per minute and the
 * circulation is as in `s`: the linear steady state, solved directly.
 */
function steadyState(s: BodyState, h: Hormone) {
  const ids = BLOOD_COMPARTMENTS,
    n = ids.length,
    at = new Map(ids.map((id, i) => [id, i])),
    c = s.transport.compartments;
  const a = Array.from({length: n}, () => new Array<number>(n + 1).fill(0));
  ids.forEach((id, i) => {
    a[i][i] -= clearance(h, id) * c[id].volume;
  });
  for (const e of bloodEdges(s)) {
    const from = at.get(e.from)!,
      to = at.get(e.to)!;
    a[from][from] -= e.flow;
    a[to][from] += e.flow;
  }
  a[at.get(hormoneInfo[h].drain)!][n] = -1;
  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let r = col + 1; r < n; r++) if (Math.abs(a[r][col]) > Math.abs(a[pivot][col])) pivot = r;
    [a[col], a[pivot]] = [a[pivot], a[col]];
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const f = a[r][col] / a[col][col];
      for (let k = col; k <= n; k++) a[r][k] -= f * a[col][k];
    }
  }
  return Object.fromEntries(ids.map((id, i) => [id, a[i][n] / a[i][i]]));
}

/**
 * Sets each gland's resting release so that arterial blood holds 1 at rest, and fills every blood
 * compartment with its steady level for the gland's current drive. Called once per new body.
 */
export function startHormones(s: BodyState) {
  const drive = releaseDrive(s);
  for (const h of HORMONES) {
    const unit = steadyState(s, h),
      rate = 1 / unit.arterial;
    s.hormoneRate[h] = rate;
    s.hormoneBlood[h] = {};
    s.hormoneAmount[h] = {};
    for (const id of BLOOD_COMPARTMENTS) {
      s.hormoneBlood[h][id] = unit[id] * rate * drive[h];
      s.hormoneAmount[h][id] = s.hormoneBlood[h][id] * s.transport.compartments[id].volume;
    }
    s.hormones[h] = s.hormoneBlood[h].arterial;
    s.secretion[h] = drive[h];
  }
}

/**
 * Glands release into their own vein, blood carries each hormone around the circulation with the
 * same flows as everything else, and every compartment clears it. `dt` is in minutes.
 */
export function updateHormones(s: BodyState, dt: number) {
  const drive = releaseDrive(s),
    c = s.transport.compartments,
    ids = BLOOD_COMPARTMENTS,
    n = ids.length,
    at = new Map(ids.map((id, i) => [id, i])),
    edges = bloodEdges(s).map((e) => ({from: at.get(e.from)!, to: at.get(e.to)!, flow: e.flow})),
    volume = ids.map((id) => Math.max(1e-9, c[id].volume));
  let fastest = 0;
  for (const e of edges) fastest = Math.max(fastest, (e.flow * dt) / Math.max(1, volume[e.from]));
  const steps = Math.max(1, Math.ceil(fastest / 0.25)),
    subdt = dt / steps,
    amount = new Float64Array(n),
    moves = new Float64Array(edges.length),
    kept = new Float64Array(n);
  for (const h of HORMONES) {
    const stored = s.hormoneAmount[h],
      source = at.get(hormoneInfo[h].drain)!,
      release = s.hormoneRate[h] * drive[h] * subdt;
    for (let i = 0; i < n; i++) {
      amount[i] = stored[ids[i]];
      kept[i] = Math.exp(-clearance(h, ids[i]) * subdt);
    }
    for (let step = 0; step < steps; step++) {
      // Moves are computed from the same old amounts, then applied together.
      for (let k = 0; k < edges.length; k++) moves[k] = (amount[edges[k].from] / volume[edges[k].from]) * edges[k].flow * subdt;
      for (let k = 0; k < edges.length; k++) {
        amount[edges[k].from] -= moves[k];
        amount[edges[k].to] += moves[k];
      }
      for (let i = 0; i < n; i++) amount[i] *= kept[i];
      amount[source] += release;
    }
    for (let i = 0; i < n; i++) {
      stored[ids[i]] = amount[i];
      s.hormoneBlood[h][ids[i]] = amount[i] / volume[i];
    }
    s.hormones[h] = s.hormoneBlood[h].arterial;
    s.secretion[h] = drive[h];
  }
}
