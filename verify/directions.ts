/**
 * Gate A3: things physiology agrees on, checked against the engine.
 * Each row runs the body with the cause and a twin without it, and passes when the
 * effect has the right sign by the stated time. Exact numbers are not the bar.
 * A row with `pending` names the missing piece; it shows as a gap in the report, never as a pass.
 */
import {advance,applyAction,createBody,glucose} from '../app/simulation/engine';
import {hormoneIn} from '../app/simulation/endocrine';
import type {Action,BodyState} from '../app/simulation/types';

export type Direction = {
  id: string;
  /** The chain this row belongs to, in plain words. Rows of one chain are shown together. */
  chain: string;
  /** What must happen, in plain words. */
  claim: string;
  /** Applied at time zero to the treated body only. */
  cause?: Action[];
  /** Number read from the body; `unit` is shown in the report. */
  read?: (s: BodyState) => number;
  unit?: string;
  /** up / down: treated vs untreated twin at `by`. settles: treated has come back at least halfway from its peak by `by`. */
  expect?: 'up' | 'down' | 'settles';
  /** Seconds after the cause. */
  by?: number;
  /** Smallest change that counts, as a fraction of the untreated value (default 2%). */
  min?: number;
  /** Not testable yet: what has to be built first. */
  pending?: string;
};

export type DirectionResult = Direction & {status: 'pass' | 'fail' | 'pending'; detail: string; treated?: number; control?: number};

const meal75: Action = {kind: 'meal', meal: {carbs: 75, protein: 25, fat: 20, water: 350, sodium: 600}};
const water750: Action = {kind: 'meal', meal: {carbs: 0, protein: 0, fat: 0, water: 750, sodium: 0}};
const jog: Action = {kind: 'environment', values: {exercise: 0.6}};
const thinAir: Action = {kind: 'environment', values: {oxygen: 0.12}};
const fright: Action = {kind: 'environment', values: {stress: 0.8}};
const flow = (id: string) => (s: BodyState) => s.flows.find((f) => f.id === id)!.flow;
const muscleSugarUse = (s: BodyState) => s.transport.metabolism.muscle?.glucose ?? 0;
const min = 60, hour = 3600;

export const directions: Direction[] = [
  {id: 'rest-glucose', chain: 'At rest the body is calm', claim: 'Blood sugar stays put for an hour with nothing happening', read: glucose, unit: 'mg/dL', expect: 'settles', by: hour},
  {id: 'rest-heart', chain: 'At rest the body is calm', claim: 'Heart rate stays put for an hour with nothing happening', read: (s) => s.heartRate, unit: 'beats/min', expect: 'settles', by: hour},

  {id: 'meal-glucose-up', chain: 'Glucose up → insulin up → glucose back down', claim: 'A 75 g carbohydrate meal raises blood sugar within 30 minutes', cause: [meal75], read: glucose, unit: 'mg/dL', expect: 'up', by: 30 * min},
  {id: 'meal-insulin-up', chain: 'Glucose up → insulin up → glucose back down', claim: 'Insulin rises within 30 minutes of the meal', cause: [meal75], read: (s) => s.hormones.insulin, unit: '× rest', expect: 'up', by: 30 * min},
  {id: 'meal-portal-first', chain: 'Glucose up → insulin up → glucose back down', claim: 'Sugar reaches the portal vein (gut to liver) before the arteries: portal sugar is above arterial sugar at 15 minutes', cause: [meal75], read: (s) => portalMinusArterial(s), unit: 'mg/dL', expect: 'up', by: 15 * min, min: 0},
  {id: 'meal-glucose-down', chain: 'Glucose up → insulin up → glucose back down', claim: 'Blood sugar comes most of the way back by 3 hours', cause: [meal75], read: glucose, unit: 'mg/dL', expect: 'settles', by: 3 * hour},

  {id: 'exercise-heart', chain: 'Exercise → heart, muscle flow and sugar uptake up', claim: 'Jogging speeds the heart within 5 minutes', cause: [jog], read: (s) => s.heartRate, unit: 'beats/min', expect: 'up', by: 5 * min, min: 0.15},
  {id: 'exercise-muscle-flow', chain: 'Exercise → heart, muscle flow and sugar uptake up', claim: 'Jogging sends more blood to the muscles within 5 minutes', cause: [jog], read: flow('muscle'), unit: 'L/min', expect: 'up', by: 5 * min, min: 0.3},
  {id: 'exercise-muscle-sugar', chain: 'Exercise → heart, muscle flow and sugar uptake up', claim: 'Jogging muscles burn more sugar within 10 minutes', cause: [jog], read: muscleSugarUse, unit: 'rate', expect: 'up', by: 10 * min, min: 0.1},

  {id: 'water-adh', chain: 'Big water drink → ADH down → more urine', claim: 'Drinking 750 mL lowers ADH within an hour', cause: [water750], read: (s) => s.hormones.adh, unit: '× rest', expect: 'down', by: hour},
  {id: 'water-urine', chain: 'Big water drink → ADH down → more urine', claim: 'Drinking 750 mL makes more urine within an hour', cause: [water750], read: (s) => s.urineTotal, unit: 'mL', expect: 'up', by: hour, min: 0.1},

  {id: 'low-oxygen-saturation', chain: 'Low oxygen → faster breathing', claim: 'Thin air (12% oxygen) lowers blood oxygen within 5 minutes', cause: [thinAir], read: (s) => s.saturation, unit: '%', expect: 'down', by: 5 * min},
  {id: 'low-oxygen-breathing', chain: 'Low oxygen → faster breathing', claim: 'Thin air makes breathing faster within 5 minutes', cause: [thinAir], read: (s) => s.respiratoryRate, unit: 'breaths/min', expect: 'up', by: 5 * min, min: 0.05},

  {id: 'meal-glucagon-down', chain: 'Glucose up → insulin up → glucose back down', claim: 'Glucagon, which tells the liver to release sugar, falls within 30 minutes of the meal', cause: [meal75], read: (s) => s.hormones.glucagon, unit: '× rest', expect: 'down', by: 30 * min, min: 0.2},
  {id: 'meal-portal-insulin', chain: 'Glucose up → insulin up → glucose back down', claim: 'Insulin is released into the portal vein, so it is higher there than in the arteries, and more so after the meal', cause: [meal75], read: (s) => hormoneIn(s, 'insulin', 'portal') - s.hormones.insulin, unit: '× rest', expect: 'up', by: 20 * min, min: 0.2},
  {id: 'meal-muscle-store', chain: 'Glucose up → insulin up → glucose back down', claim: 'Insulin makes the muscles store sugar as glycogen within 2 hours', cause: [meal75], read: (s) => s.muscleGlycogen, unit: 'g', expect: 'up', by: 2 * hour, min: 0.01},

  {id: 'stress-adrenaline', chain: 'Stress → adrenaline → faster heart, sugar released', claim: 'A fright raises adrenaline within 2 minutes', cause: [fright], read: (s) => s.hormones.epinephrine, unit: '× rest', expect: 'up', by: 2 * min, min: 0.5},
  {id: 'stress-heart', chain: 'Stress → adrenaline → faster heart, sugar released', claim: 'A fright speeds the heart within 2 minutes', cause: [fright], read: (s) => s.heartRate, unit: 'beats/min', expect: 'up', by: 2 * min, min: 0.1},
  {id: 'stress-cortisol', chain: 'Stress → adrenaline → faster heart, sugar released', claim: 'Lasting stress raises cortisol within 30 minutes', cause: [fright], read: (s) => s.hormones.cortisol, unit: '× rest', expect: 'up', by: 30 * min, min: 0.15},
  {id: 'exercise-glucose-held', chain: 'Exercise → heart, muscle flow and sugar uptake up', claim: 'Blood sugar holds within about 10% through 20 minutes of jogging: muscles burn their own glycogen and the liver releases more', cause: [jog], read: glucose, unit: 'mg/dL', expect: 'settles', by: 20 * min, min: 0.1},

  {id: 'short-sleep-cortisol', chain: 'Short sleep → morning cortisol → morning glucose', claim: 'A short night raises morning cortisol, then morning blood sugar a little', pending: 'The engine now has a clock (cortisol peaks at 08:00, melatonin at night) and an asleep input, but no effect of lost sleep yet; needs sleep from a fitness band (plan step 5).'},
  {id: 'hrv-heart', chain: 'High HRV → lower resting heart rate', claim: 'A person with high heart rate variability has a lower resting heart rate', pending: 'Needs HRV from a fitness band to set vagal tone (plan step 5).'},
];

function portalMinusArterial(s: BodyState) {
  const c = s.transport.compartments, mgdl = (id: string) => (c[id].amounts.glucose / c[id].volume) * 100000;
  return mgdl('portal') - mgdl('arterial');
}

/** Run one row: a treated body and an untreated twin, sampled every minute. */
export function check(d: Direction): DirectionResult {
  if (d.pending || !d.read || !d.expect || !d.by) return {...d, status: 'pending', detail: d.pending ?? 'Incomplete row.'};
  const treated = createBody(), control = createBody();
  for (const a of d.cause ?? []) applyAction(treated, a);
  const start = d.read(treated);
  let peak = start;
  for (let t = 0; t < d.by; t += 60) {
    advance(treated, 60);
    advance(control, 60);
    const v = d.read(treated);
    if (Math.abs(v - start) > Math.abs(peak - start)) peak = v;
  }
  const a = d.read(treated), b = d.read(control), floor = (d.min ?? 0.02) * Math.abs(b), fmt = (x: number) => `${+x.toPrecision(4)} ${d.unit ?? ''}`.trim();
  if (d.expect === 'settles') {
    // Rest rows have no cause: the twin is the start. Pass when the excursion is small or has mostly come back.
    const excursion = Math.abs(peak - start), left = Math.abs(a - start), quiet = excursion <= Math.max(floor, 1e-9);
    const pass = quiet || left <= excursion / 2;
    return {...d, status: pass ? 'pass' : 'fail', treated: a, control: start, detail: quiet ? `Stayed within ${fmt(excursion)} of ${fmt(start)}.` : `Started ${fmt(start)}, peaked ${fmt(peak)}, ${fmt(a)} at the end (${pass ? 'came back' : 'did not come back'} at least halfway).`};
  }
  const diff = a - b, pass = d.expect === 'up' ? diff > floor : -diff > floor;
  return {...d, status: pass ? 'pass' : 'fail', treated: a, control: b, detail: `With the cause ${fmt(a)}, without ${fmt(b)} (needs ${d.expect} by more than ${fmt(floor)}).`};
}
