import {
  HORMONES,
  type Action,
  type BodyState,
  type Inputs,
  type Organ,
  type PersonalBaseline,
  type Sample,
} from "./types";
import { arousal, clamp, relax, reninDrive, restingSympathetic, startHormones, updateHormones } from "./endocrine";
import {
  concentration,
  createTransport,
  distributeWaterVolumes,
  oxygenContent,
  syncNutrientTotals,
  transfer,
  transportSubstances,
  carryMark,
  markMeal,
  updateBloodMeasurements,
} from "./transport";

export const MODEL_VERSION = "atlas-physiology-0.5.0";
export const INPUT_BOUNDS: Record<keyof Inputs, [number, number]> = {
  exercise: [0, 1],
  oxygen: [0.1, 0.3],
  temperature: [5, 40],
  sleep: [0, 1],
  stress: [0, 1],
};
/** A typical adult. Measurements replace these. */
export const TYPICAL: PersonalBaseline = {
  insulinSensitivity: 1,
  betaCellResponse: 1,
  metabolicRate: 1,
  kidneyClearance: 1,
  oxygenCarrying: 1,
  restingHeartRate: 72,
  autonomicTone: 0,
};
export const PARAM_BOUNDS: Record<keyof PersonalBaseline, [number, number]> = {
  insulinSensitivity: [0.2, 3],
  betaCellResponse: [0.2, 3],
  metabolicRate: [0.5, 2],
  kidneyClearance: [0.2, 1.5],
  oxygenCarrying: [0.5, 1.3],
  restingHeartRate: [35, 110],
  autonomicTone: [-1, 1],
};
export const glucose = (s: BodyState) =>
  concentration(s.transport.compartments.arterial, "glucose") * 100000;
export const totalWater = (s: BodyState) =>
  s.plasma + s.interstitial + s.intracellular + s.stomach.water + s.gut.water;
export const waterResidual = (s: BodyState) =>
  totalWater(s) + s.urineTotal + s.insensibleLoss - 42000 - s.waterIn - s.metabolicWater;
export const carbohydrateResidual = (s: BodyState) =>
  s.stomach.carbs +
  s.gut.carbs +
  s.glucoseMass +
  s.glycogen +
  s.muscleGlycogen +
  s.glucoseUsed +
  s.glucoseExcreted -
  522.6 -
  s.carbIn -
  s.glucoseSynthesized;
export const proteinResidual = (s: BodyState) =>
  s.stomach.protein +
  s.gut.protein +
  s.aminoAcids +
  s.proteinStore +
  s.proteinUsed -
  10030 -
  s.proteinIn;
export const fatResidual = (s: BodyState) =>
  s.stomach.fat + s.gut.fat + s.lipids + s.fatStore + s.fatUsed - 12015 - s.fatIn;

/** A new body at rest at 08:00, typical unless measurements say otherwise. */
export function createBody(params: Partial<PersonalBaseline> = {}): BodyState {
  for (const [k, v] of Object.entries(params)) {
    const b = PARAM_BOUNDS[k as keyof PersonalBaseline];
    if (!b || typeof v !== "number" || !Number.isFinite(v) || v < b[0] || v > b[1])
      throw new Error(`Invalid personal baseline value: ${k}.`);
  }
  const p = { ...TYPICAL, ...params };
  const s: BodyState = {
    version: 3,
    transport: createTransport(),
    time: 0,
    inputs: {
      exercise: 0,
      oxygen: 0.2095,
      temperature: 22,
      sleep: 0,
      stress: 0,
    },
    params: p,
    hormones: Object.fromEntries(HORMONES.map((k) => [k, 1])) as BodyState["hormones"],
    hormoneBlood: {} as BodyState["hormoneBlood"],
    hormoneAmount: {} as BodyState["hormoneAmount"],
    hormoneRate: {} as BodyState["hormoneRate"],
    secretion: Object.fromEntries(HORMONES.map((k) => [k, 1])) as BodyState["secretion"],
    enzymes: { amylase: 1, protease: 1, lipase: 1, pepsin: 1 },
    digestionRates: { carbs: 0, protein: 0, fat: 0 },
    stomach: { carbs: 0, protein: 0, fat: 0, water: 0 },
    gut: { carbs: 0, protein: 0, fat: 0, water: 0 },
    glucoseMass: 12.6,
    aminoAcids: 30,
    lipids: 15,
    glycogen: 110,
    muscleGlycogen: 400,
    lastFood: -1,
    fatStore: 12000,
    proteinStore: 10000,
    plasma: 3000,
    interstitial: 11000,
    intracellular: 28000,
    sodium: 1960,
    urea: 300,
    bladder: 0,
    urineTotal: 0,
    sodiumExcreted: 0,
    insensibleLoss: 0,
    metabolicWater: 0,
    waterIn: 0,
    carbIn: 0,
    proteinIn: 0,
    fatIn: 0,
    glucoseSynthesized: 0,
    glucoseUsed: 0,
    glucoseExcreted: 0,
    proteinUsed: 0,
    fatUsed: 0,
    heartRate: p.restingHeartRate,
    strokeVolume: 70,
    cardiacOutput: 5.04,
    map: 93,
    respiratoryRate: 12,
    tidalVolume: 500,
    paO2: 98,
    paCO2: 40,
    saturation: 97.8,
    oxygenConsumption: 250,
    oxygenDemand: 250,
    lungOxygenTarget: oxygenContent(98),
    lungCO2Target: 0.48,
    oxygenDelivered: 1000,
    oxygenDebt: 0,
    inhaledOxygen: 0,
    exhaledCO2: 0,
    coreTemperature: 37,
    sympathetic: 0.15 + 0.12 * p.autonomicTone,
    parasympathetic: 0.7 - 0.2 * p.autonomicTone,
    fatigue: 0,
    osmolarity: 285,
    gfr: 120,
    urineRate: 1,
    sweatRate: 0.3,
    lymphRate: 2,
    csf: 150,
    flows: [],
    queue: [],
    receipts: [],
    nextId: 1,
    history: [],
    lastSample: 0,
  };
  s.cardiacOutput = (s.heartRate * s.strokeVolume) / 1000;
  syncNutrientTotals(s);
  updateFlows(s);
  startHormones(s);
  s.history.push(sample(s));
  return s;
}

export function sample(s: BodyState): Sample {
  return {
    time: s.time,
    heartRate: s.heartRate,
    map: s.map,
    cardiacOutput: s.cardiacOutput,
    saturation: s.saturation,
    glucose: glucose(s),
    portalGlucose: concentration(s.transport.compartments.portal, "glucose") * 100000,
    hepaticGlucose: concentration(s.transport.compartments["liver-blood"], "glucose") * 100000,
    venousOxygen: concentration(s.transport.compartments.venous, "oxygen") * 100,
    oxygenConsumption: s.oxygenConsumption,
    oxygenDebt: s.oxygenDebt,
    co2: s.paCO2,
    temperature: s.coreTemperature,
    plasma: s.plasma,
    urine: s.urineRate,
    brainFlow: s.flows.find((f) => f.id === "brain")?.flow ?? 0,
    hormones: { ...s.hormones },
  };
}
function receipt(
  s: BodyState,
  title: string,
  detail: string,
  category: "input" | "response" = "input",
) {
  s.receipts.push({ id: s.nextId++, time: s.time, title, detail, category });
  // Receipts remain complete for replay; only the plotted history is bounded.
}
export function validateAction(action: Action): void {
  if (!action || typeof action !== "object") throw new Error("An action is required.");
  if (action.kind === "meal") {
    const max = { carbs: 300, protein: 200, fat: 150, water: 2000, sodium: 5000 };
    for (const k of Object.keys(max) as (keyof typeof max)[])
      if (!Number.isFinite(action.meal?.[k]) || action.meal[k] < 0 || action.meal[k] > max[k])
        throw new Error(`Meal ${k} must be between 0 and ${max[k]}.`);
  } else if (action.kind === "environment") {
    if (!action.values || typeof action.values !== "object")
      throw new Error("Environment values are required.");
    for (const [k, v] of Object.entries(action.values)) {
      const b = INPUT_BOUNDS[k as keyof Inputs];
      if (
        !Object.hasOwn(INPUT_BOUNDS, k) ||
        !b ||
        typeof v !== "number" ||
        !Number.isFinite(v) ||
        v < b[0] ||
        v > b[1]
      )
        throw new Error(`Invalid environment value: ${k}.`);
    }
  } else if (action.kind !== "void") throw new Error("Unknown action kind.");
}
export function applyAction(s: BodyState, action: Action, label?: string) {
  validateAction(action);
  if (action.kind === "meal") {
    const m = action.meal;
    for (const k of ["carbs", "protein", "fat", "water"] as const) s.stomach[k] += m[k];
    if (m.carbs + m.protein + m.fat > 0) s.lastFood = s.time;
    markMeal(s, m);
    // Sodium is a rapidly mixed extracellular pool; gut sodium transit is not resolved.
    s.sodium += m.sodium / 22.99;
    s.waterIn += m.water;
    s.carbIn += m.carbs;
    s.proteinIn += m.protein;
    s.fatIn += m.fat;
    receipt(
      s,
      label ?? "Meal ingested",
      `${m.carbs} g carbohydrate · ${m.protein} g protein · ${m.fat} g fat · ${m.water} mL water · ${m.sodium} mg sodium`,
    );
  } else if (action.kind === "environment") {
    Object.assign(s.inputs, action.values);
    receipt(
      s,
      label ?? "External conditions changed",
      Object.entries(action.values)
        .map(([k, v]) => `${k}: ${v}`)
        .join(" · "),
    );
  } else {
    receipt(
      s,
      label ?? "Bladder emptied",
      `${s.bladder.toFixed(0)} mL voided. Cumulative renal excretion is retained.`,
    );
    s.bladder = 0;
  }
}
export function schedule(s: BodyState, at: number, action: Action, label: string) {
  if (!Number.isInteger(at) || at < s.time || at > 7 * 86400)
    throw new Error("Schedule an integer second at or after the current time, within seven days.");
  validateAction(action);
  s.queue.push({ id: s.nextId++, at, label, action: structuredClone(action) });
  s.queue.sort((a, b) => a.at - b.at || a.id - b.id);
}

const NUTRIENT_OF = { carbs: "glucose", protein: "aminoAcids", fat: "lipids" } as const;
function digest(s: BodyState, dt: number) {
  const h = s.hormones,
    vagal = clamp(s.parasympathetic / 0.7, 0.25, 1.4);
  // The gut's own local signals (gastrin, secretin, CCK) follow the food in it directly.
  const gastric = s.stomach.carbs + s.stomach.protein + s.stomach.fat,
    fatAndProtein = (s.gut.fat + s.gut.protein) / 12;
  s.enzymes.pepsin = relax(s.enzymes.pepsin, (1 + gastric / 30) * vagal, dt, 4);
  s.enzymes.amylase = relax(s.enzymes.amylase, (1 + gastric / 300) * vagal, dt, 5);
  s.enzymes.protease = relax(s.enzymes.protease, (1 + 0.35 * fatAndProtein) * vagal, dt, 6);
  s.enzymes.lipase = relax(s.enzymes.lipase, (1 + 0.5 * fatAndProtein) * vagal, dt, 8);
  const tau = (35 * (1 + 0.14 * fatAndProtein + 0.1 * (h.glp1 - 1))) / vagal;
  // Solid food is churned for the first quarter hour before the stomach empties it at full pace.
  const mixing = s.lastFood < 0 ? 1 : clamp((s.time - s.lastFood) / 900, 0.15, 1);
  for (const k of ["carbs", "protein", "fat", "water"] as const) {
    const amount = s.stomach[k] * -Math.expm1(-dt / (k === "water" ? 12 : tau / mixing));
    if (k !== "water") carryMark(s, "stomach", "intestinal lumen", NUTRIENT_OF[k], amount, s.stomach[k]);
    s.stomach[k] -= amount;
    s.gut[k] += amount;
  }
  const specs = {
    carbs: { v: 0.9, km: 15, e: s.enzymes.amylase },
    protein: { v: 0.45, km: 12, e: s.enzymes.protease * Math.sqrt(s.enzymes.pepsin) },
    fat: { v: 0.3, km: 10, e: s.enzymes.lipase },
  };
  for (const k of ["carbs", "protein", "fat"] as const) {
    const p = specs[k],
      lumen = s.gut[k],
      amount = Math.min(s.gut[k], ((p.v * p.e * s.gut[k]) / (p.km + s.gut[k])) * dt);
    s.gut[k] -= amount;
    s.digestionRates[k] = amount / dt;
    transfer(
      s,
      "intestinal lumen",
      k === "fat" ? "lymph" : "portal",
      NUTRIENT_OF[k],
      amount,
      "absorption",
      lumen,
    );
  }
  const water = s.gut.water * -Math.expm1(-dt / 15);
  s.gut.water -= water;
  s.plasma += water;
}

function metabolize(s: BodyState, dt: number) {
  const h = s.hormones,
    g = glucose(s),
    exercise = s.inputs.exercise,
    c = s.transport.compartments,
    // Insulin's effect on muscle, fat and liver, scaled by how sensitive this person is to it.
    insulin = Math.max(0.05, 1 + (h.insulin - 1) * s.params.insulinSensitivity);
  // Glucagon and adrenaline make the liver break down glycogen; insulin holds it back.
  const release = Math.min(
    s.glycogen,
    ((dt * 0.12 * h.glucagon * (1 + 0.15 * (h.epinephrine - 1))) / Math.sqrt(insulin)) *
      clamp((120 - g) / 30, 0, 4),
  );
  s.glycogen -= release;
  transfer(s, "hepatic glycogen", "liver-tissue", "glucose", release, "reaction", s.glycogen + release);
  const synthesisDemand =
    0.008 * Math.max(0, h.cortisol - 1) +
    0.09 * clamp((95 - s.glycogen) / 95, 0, 1) * clamp((100 - g) / 15, 0, 2);
  const protein = Math.min(
    c["liver-tissue"].amounts.aminoAcids + s.proteinStore,
    (synthesisDemand * dt) / 0.6,
  );
  const local = transfer(s, "liver-tissue", "gluconeogenesis", "aminoAcids", protein, "reaction");
  s.proteinStore -= protein - local;
  s.proteinUsed += protein;
  s.urea += protein * 5;
  const synthesis = protein * 0.6;
  transfer(s, "gluconeogenesis", "liver-tissue", "glucose", synthesis, "reaction");
  s.glucoseSynthesized += synthesis;
  const store = transfer(
    s,
    "liver-tissue",
    "hepatic glycogen",
    "glucose",
    Math.min(
      Math.max(0, 500 - s.glycogen),
      dt * 0.08 * Math.max(0, insulin - 1) * clamp((g - 85) / 25, 0, 3),
    ),
    "reaction",
  );
  s.glycogen += store;
  // Insulin opens muscle to sugar (GLUT4), which it stores as glycogen: most of a meal's sugar ends here.
  const muscleStore = transfer(
    s,
    "muscle-tissue",
    "muscle glycogen",
    "glucose",
    Math.min(
      Math.max(0, 700 - s.muscleGlycogen),
      dt * 0.05 * Math.max(0, insulin - 1) * clamp((g - 60) / 40, 0, 2),
    ),
    "reaction",
  );
  s.muscleGlycogen += muscleStore;
  const aminoStore = transfer(
    s,
    "muscle-tissue",
    "protein reserve",
    "aminoAcids",
    (Math.max(0, c["muscle-tissue"].amounts.aminoAcids - (c["muscle-tissue"].volume * 30) / 14000) *
      dt) /
      90,
    "reaction",
  );
  s.proteinStore += aminoStore;
  const lipidStore = transfer(
    s,
    "adipose-tissue",
    "fat reserve",
    "lipids",
    (Math.max(0, c["adipose-tissue"].amounts.lipids - (c["adipose-tissue"].volume * 15) / 14000) *
      dt) /
      60,
    "reaction",
  );
  s.fatStore += lipidStore;
  const lipidRelease = Math.min(
    s.fatStore,
    (((0.08 + 0.24 * exercise) * dt * (1 + 0.1 * (h.epinephrine - 1))) / Math.sqrt(insulin)) *
      clamp(1 + (15 - s.lipids) / 5, 0, 3),
  );
  s.fatStore -= lipidRelease;
  transfer(s, "fat reserve", "adipose-tissue", "lipids", lipidRelease, "reaction", s.fatStore + lipidRelease);
  const weights: Record<string, number> = {
    heart: 0.1,
    brain: 0.2,
    liver: 0.15,
    gut: 0.1,
    kidneys: 0.1,
    muscle: 0.2 + exercise * 4,
    skin: 0.03,
    adipose: 0.04,
    endocrine: 0.08,
  };
  const sum = Object.values(weights).reduce((a, b) => a + b, 0);
  let totalOxygen = 0,
    totalCO2 = 0;
  for (const [id, weight] of Object.entries(weights)) {
    const demand = (s.oxygenDemand * weight) / sum,
      blood = c[`${id}-blood`],
      tissue = c[`${id}-tissue`];
    const insulinShare = 0.05 * (insulin - 1);
    const carbShare =
      id === "brain"
        ? 1
        : clamp(
            0.198 + exercise * 0.36 + insulinShare + 0.025 * (h.epinephrine - 1),
            0.08,
            0.9,
          );
    // Working muscle burns mostly its own glycogen, so exercise does not drain blood sugar at once.
    const carbNeed = ((demand * carbShare) / 746) * dt,
      fromGlycogen = id === "muscle" ? Math.min(s.muscleGlycogen, carbNeed * clamp(exercise * 1.2, 0, 0.8)) : 0,
      fromTissue = Math.min(tissue.amounts.glucose, carbNeed - fromGlycogen);
    let carb = fromGlycogen + fromTissue,
      lipid = Math.min(tissue.amounts.lipids, ((demand * (1 - carbShare)) / 2010) * dt);
    // The brain bed has no fatty-acid oxidation; ketone support remains future work.
    const needed = carb * 746 + lipid * 2010,
      oxygenScale = needed > 0 ? Math.min(1, blood.amounts.oxygen / needed) : 1;
    carb *= oxygenScale;
    lipid *= oxygenScale;
    transfer(s, tissue.id, "oxidized substrate", "glucose", fromTissue * oxygenScale, "reaction");
    if (fromGlycogen > 0) {
      const burned = fromGlycogen * oxygenScale;
      transfer(s, "muscle glycogen", "oxidized substrate", "glucose", burned, "reaction", s.muscleGlycogen);
      s.muscleGlycogen -= burned;
    }
    transfer(s, tissue.id, "oxidized substrate", "lipids", lipid, "reaction");
    const usedOxygen = transfer(
      s,
      blood.id,
      "oxidative metabolism",
      "oxygen",
      carb * 746 + lipid * 2010,
      "reaction",
    );
    const producedCO2 = carb * 746 + lipid * 2010 * 0.7;
    transfer(s, "oxidative metabolism", blood.id, "carbonDioxide", producedCO2, "reaction");
    s.glucoseUsed += carb;
    s.fatUsed += lipid;
    totalOxygen += usedOxygen;
    totalCO2 += producedCO2;
    s.transport.metabolism[id] = {
      glucose: carb / dt,
      lipids: lipid / dt,
      oxygen: usedOxygen / dt,
      oxygenDemand: demand,
      carbonDioxide: producedCO2 / dt,
    };
  }
  s.transport.oxygenConsumed += totalOxygen;
  s.transport.co2Produced += totalCO2;
  s.oxygenConsumption = totalOxygen / dt;
  s.exhaledCO2 = s.transport.co2Exhaled;
  s.oxygenDebt += Math.max(0, s.oxygenDemand * dt - totalOxygen);
  syncNutrientTotals(s);
}

function circulationAndBreathing(s: BodyState, dt: number) {
  const i = s.inputs,
    h = s.hormones,
    volume = clamp(s.plasma / 3000, 0.4, 1.5);
  const lowO2 = Math.max(0, 94 - s.saturation) / 25,
    baro = clamp((93 - s.map) / 75, -0.15, 0.4);
  const p = s.params,
    rest = restingSympathetic(s);
  s.sympathetic = relax(
    s.sympathetic,
    clamp(rest + i.exercise * 0.65 + i.stress * 0.6 + lowO2 + baro - i.sleep * 0.1, 0, 1.5),
    dt,
    0.15,
  );
  s.parasympathetic = relax(
    s.parasympathetic,
    clamp(0.7 - 0.2 * p.autonomicTone + i.sleep * 0.25 - (s.sympathetic - rest) * 0.6, 0.1, 1),
    dt,
    0.3,
  );
  // Sympathetic nerves (noradrenaline) act at once; adrenaline and thyroid hormone add through the blood.
  const nerves = arousal(s);
  const hrTarget = clamp(
    p.restingHeartRate +
      68 * i.exercise +
      9 * (h.epinephrine - 1) +
      30 * nerves +
      8 * (h.thyroid - 1) -
      12 * i.sleep,
    35,
    200,
  );
  s.heartRate = relax(s.heartRate, hrTarget, dt, 0.5);
  s.strokeVolume = relax(s.strokeVolume, clamp((70 + 35 * i.exercise) * volume, 30, 130), dt, 0.8);
  s.cardiacOutput = (s.heartRate * s.strokeVolume) / 1000;
  const resistance =
    (17.46 * (1 + 0.325 * nerves + 0.045 * (reninDrive(s) - 1))) /
    (1 + 2.2 * i.exercise);
  s.map = relax(s.map, 5 + s.cardiacOutput * resistance, dt, 0.25);
  s.oxygenDemand =
    250 * (1 + 6 * i.exercise + 0.25 * (h.thyroid - 1) + 0.1 * Math.max(0, s.coreTemperature - 37));
  const ventilationDrive = clamp(1 + 6 * i.exercise + (s.paCO2 - 40) * 0.04 + lowO2, 0.3, 9);
  s.respiratoryRate = relax(
    s.respiratoryRate,
    clamp(12 + 18 * i.exercise + (s.paCO2 - 40) * 0.3 + lowO2 * 8, 6, 45),
    dt,
    0.3,
  );
  s.tidalVolume = relax(
    s.tidalVolume,
    clamp(150 + (4200 * ventilationDrive) / s.respiratoryRate, 250, 2500),
    dt,
    0.3,
  );
  const alveolarVent = s.respiratoryRate * (s.tidalVolume - 150);
  const co2Target = (40 * (s.oxygenDemand / 250) * 4200) / alveolarVent;
  s.lungCO2Target = Math.max(0.1, 0.48 + (clamp(co2Target, 12, 100) - 40) * 0.006);
  const alveolarO2 = i.oxygen * 713 - clamp(co2Target, 12, 100) / 0.8;
  s.lungOxygenTarget = oxygenContent(clamp(alveolarO2 - 2, 10, 210)) * p.oxygenCarrying;
  s.inhaledOxygen += s.respiratoryRate * s.tidalVolume * i.oxygen * dt;
  updateFlows(s);
}
function updateFlows(s: BodyState) {
  const exercise = s.inputs.exercise,
    gutLoad =
      s.stomach.carbs + s.stomach.protein + s.stomach.fat + s.gut.carbs + s.gut.protein + s.gut.fat;
  const weights: Record<Exclude<Organ, "lungs">, number> = {
    heart: 0.04 * (1 + exercise * 2),
    brain: 0.14 * (1 + Math.max(0, s.paCO2 - 40) * 0.025),
    liver: 0.065,
    gut: 0.205 * (1 + Math.min(1, gutLoad / 100)),
    kidneys: 0.2,
    muscle: 0.19 + exercise * 2,
    skin: 0.06 + Math.max(0, s.coreTemperature - 37) * 0.08,
    adipose: 0.06,
    endocrine: 0.04,
  };
  const sum = Object.values(weights).reduce((a, b) => a + b, 0);
  const names: Record<Organ, string> = {
    heart: "Coronary circulation",
    lungs: "Pulmonary circulation",
    brain: "Brain",
    liver: "Liver (hepatic artery)",
    gut: "Gut → portal vein",
    kidneys: "Kidneys",
    muscle: "Skeletal muscle",
    skin: "Skin",
    adipose: "Adipose tissue",
    endocrine: "Other / endocrine tissue",
  };
  const metabolicWeights: Record<Exclude<Organ, "lungs">, number> = {
    heart: 0.1,
    brain: 0.2,
    liver: 0.15,
    gut: 0.1,
    kidneys: 0.1,
    muscle: 0.2 + exercise * 4,
    skin: 0.03,
    adipose: 0.04,
    endocrine: 0.08,
  };
  const metabolicSum = Object.values(metabolicWeights).reduce((a, b) => a + b, 0);
  const arterialO2 = (1.34 * 15 * s.saturation) / 100 + 0.003 * s.paO2;
  s.flows = (Object.keys(weights) as Exclude<Organ, "lungs">[]).map((id) => {
    const flow = (s.cardiacOutput * weights[id]) / sum,
      oxygenUse = (s.oxygenConsumption * metabolicWeights[id]) / metabolicSum;
    return {
      id,
      name: names[id],
      flow,
      oxygenUse,
      venousO2: Math.max(0, arterialO2 - oxygenUse / (flow * 10)),
    };
  });
  const mixedO2 = s.flows.reduce((a, f) => a + f.venousO2 * f.flow, 0) / s.cardiacOutput;
  s.flows.push({
    id: "lungs",
    name: names.lungs,
    flow: s.cardiacOutput,
    oxygenUse: 0,
    venousO2: mixedO2,
  });
}

function fluidsAndHeat(s: BodyState, dt: number) {
  const h = s.hormones,
    exercise = s.inputs.exercise;
  s.osmolarity = (2 * s.sodium) / ((s.plasma + s.interstitial) / 1000) + 5;
  s.gfr = 120 * s.params.kidneyClearance * clamp(s.map / 93, 0.2, 1.3) * clamp(s.plasma / 3000, 0.4, 1.3);
  // A stretched heart (ANP) and full vessels add a little urine beyond what ADH allows.
  const stretch = Math.max(0, (s.plasma / 3000 - 1) * 15);
  s.urineRate = clamp((s.gfr / 120) * (1 / h.adh + 0.35 * stretch), 0.12, 15);
  s.sweatRate =
    0.3 +
    exercise * 12 +
    Math.max(0, s.inputs.temperature - 25) * 0.4 +
    Math.max(0, s.coreTemperature - 37) * 3;
  const metabolic =
    Object.values(s.transport.metabolism).reduce(
      (v, m) => v + m.glucose * 0.6 + m.lipids * 1.07,
      0,
    ) * dt;
  s.metabolicWater += metabolic;
  s.plasma += metabolic;
  const urine = Math.min(s.plasma * 0.01, s.urineRate * dt);
  const insensible = Math.min(s.plasma * 0.01, (s.sweatRate + 0.25 * (1 + exercise)) * dt);
  s.plasma -= urine + insensible;
  s.bladder += urine;
  s.urineTotal += urine;
  s.insensibleLoss += insensible;
  const sodium = Math.min(s.sodium, (urine * 0.07) / h.aldosterone + insensible * 0.025);
  s.sodium -= sodium;
  s.sodiumExcreted += sodium;
  const glucoseLoss = transfer(
    s,
    "kidneys-blood",
    "urine",
    "glucose",
    ((Math.max(
      0,
      concentration(s.transport.compartments["kidneys-blood"], "glucose") * 100000 - 180,
    ) *
      s.gfr) /
      100000) *
      dt,
    "clearance",
  );
  s.glucoseExcreted += glucoseLoss;
  s.urea = Math.max(0, s.urea - (s.urea / (s.plasma + s.interstitial)) * s.gfr * 0.4 * dt);
  // Conservative exchange between the three water compartments; lymph is included in return flux.
  const ecf = s.plasma + s.interstitial;
  const shift = (s.plasma - (ecf * 3) / 14) * -Math.expm1(-dt / 3);
  s.plasma -= shift;
  s.interstitial += shift;
  const body = ecf + s.intracellular;
  const cellularShift = (s.intracellular - (body * 2) / 3) * -Math.expm1(-dt / 45);
  s.intracellular -= cellularShift;
  s.interstitial += cellularShift;
  s.lymphRate = 2 * clamp(s.interstitial / 11000, 0.5, 2);
  s.csf = relax(s.csf, 150 + Math.max(0, s.map - 110) * 0.05, dt, 60);
  const heatTarget =
    37 + exercise * 0.75 + (s.inputs.temperature - 22) * 0.015 - 0.05 * (s.sweatRate - 0.3);
  s.coreTemperature = relax(s.coreTemperature, heatTarget, dt, 20);
  s.fatigue = clamp(s.fatigue + dt * (0.0008 + 0.015 * exercise - 0.02 * s.inputs.sleep), 0, 1);
}

function step(s: BodyState) {
  const dt = 1 / 60,
    previousG = glucose(s),
    previousO2 = s.saturation;
  s.transport.fluxes = [];
  digest(s, dt);
  syncNutrientTotals(s);
  updateHormones(s, dt);
  circulationAndBreathing(s, dt);
  transportSubstances(s, dt);
  metabolize(s, dt);
  fluidsAndHeat(s, dt);
  distributeWaterVolumes(s);
  syncNutrientTotals(s);
  updateBloodMeasurements(s);
  s.time++;
  if (previousG <= 140 && glucose(s) > 140)
    receipt(
      s,
      "Glucose rose above 140 mg/dL",
      "The modeled absorbed nutrient flux exceeds uptake and storage. Inspect insulin and hepatic storage.",
      "response",
    );
  if (previousG >= 70 && glucose(s) < 70)
    receipt(
      s,
      "Low modeled glucose",
      "Fuel release is below demand in this model. This threshold is an observation, not a clinical assessment.",
      "response",
    );
  if (previousO2 >= 90 && s.saturation < 90)
    receipt(
      s,
      "Oxygen saturation fell below 90%",
      "Inspired gas composition, ventilation, and perfusion determine the modeled oxygen supply.",
      "response",
    );
  if (s.time - s.lastSample >= 30) {
    s.history.push(sample(s));
    if (s.history.length > 2881) s.history.shift();
    s.lastSample = s.time;
  }
}

/** Mutates only the supplied state. All advancing uses fixed one-second steps. */
export function advance(s: BodyState, seconds: number) {
  if (!Number.isInteger(seconds) || seconds < 0 || seconds > 86400)
    throw new Error("Advance by an integer number of seconds between 0 and 86400.");
  const target = s.time + seconds;
  if (target > 7 * 86400)
    throw new Error("This exploratory model is limited to seven simulated days.");
  const due = () => {
    while (s.queue[0] && s.queue[0].at <= s.time) {
      const e = s.queue.shift()!;
      applyAction(s, e.action, e.label);
    }
  };
  due();
  while (s.time < target) {
    step(s);
    due();
  }
  return s;
}
