/**
 * The hormones the model carries: the ones a person's measurements (glucose sensor, blood panel,
 * fitness band) can speak to, and that drive something visible in the body.
 */
export const HORMONES = [
  "insulin",
  "glucagon",
  "glp1",
  "epinephrine",
  "cortisol",
  "thyroid",
  "adh",
  "aldosterone",
  "melatonin",
] as const;
export type Hormone = (typeof HORMONES)[number];
export type Organ =
  | "heart"
  | "lungs"
  | "brain"
  | "liver"
  | "gut"
  | "kidneys"
  | "muscle"
  | "skin"
  | "adipose"
  | "endocrine";
/** What is happening to the body now. Imported data sets these over a day. */
export type Inputs = {
  /** 0 resting to 1 hard exercise. */
  exercise: number;
  /** Fraction of oxygen in the air breathed (0.2095 at sea level). */
  oxygen: number;
  /** Air temperature, °C. */
  temperature: number;
  /** 0 awake, 1 asleep. */
  sleep: number;
  /** 0 calm to 1 acute stress (a fright, pain, a deadline). */
  stress: number;
};
/**
 * A person's measured baseline as multipliers on a typical adult (1 = typical), set once from their
 * blood panel, fitness band and similar. Every key changes something in the model.
 */
export type PersonalBaseline = {
  /** How strongly insulin makes muscle, fat and liver take up sugar. */
  insulinSensitivity: number;
  /** How much insulin the pancreas releases for a given rise in sugar. */
  betaCellResponse: number;
  /** Thyroid-set basal metabolic rate. */
  metabolicRate: number;
  /** Kidney filtering (eGFR against typical). */
  kidneyClearance: number;
  /** Oxygen the blood carries per litre (haemoglobin against typical). */
  oxygenCarrying: number;
  /** Resting heart rate, beats per minute. */
  restingHeartRate: number;
  /** -1 strongly vagal (calm, high HRV) to +1 strongly sympathetic; 0 typical. */
  autonomicTone: number;
};
export type Meal = { carbs: number; protein: number; fat: number; water: number; sodium: number };
export type Action =
  | { kind: "meal"; meal: Meal }
  | { kind: "environment"; values: Partial<Inputs> }
  | { kind: "void" };
export type ScheduledAction = { id: number; at: number; label: string; action: Action };
export type Receipt = {
  id: number;
  time: number;
  category: "input" | "response";
  title: string;
  detail: string;
};
export type Enzymes = { amylase: number; protease: number; lipase: number; pepsin: number };
export type Flow = { id: Organ; name: string; flow: number; oxygenUse: number; venousO2: number };
export const SUBSTANCES = ["glucose", "aminoAcids", "lipids", "oxygen", "carbonDioxide"] as const;
export type Substance = (typeof SUBSTANCES)[number];
/** Substances a meal delivers; gases are not followed. */
export const NUTRIENTS = ["glucose", "aminoAcids", "lipids"] as const;
export type Nutrient = (typeof NUTRIENTS)[number];
/**
 * Label on the most recent meal's nutrients. `pools` holds the labelled grams in every compartment
 * and in each place outside them (stomach, lumen, reserves, oxidation, urine), so their sum per
 * nutrient always equals `eaten`. `at` is the meal's time, or -1 before any meal.
 */
export type MealMark = {
  at: number;
  eaten: Record<Nutrient, number>;
  pools: Record<string, Record<Nutrient, number>>;
};
export type Compartment = {
  id: string;
  name: string;
  kind: "blood" | "tissue" | "lymph";
  organ: Organ | null;
  volume: number;
  amounts: Record<Substance, number>;
};
export type TransportFlux = {
  id: string;
  from: string;
  to: string;
  substance: Substance;
  amount: number;
  mechanism: "advection" | "exchange" | "reaction" | "absorption" | "clearance";
};
export type MetabolicRate = {
  glucose: number;
  lipids: number;
  oxygen: number;
  oxygenDemand: number;
  carbonDioxide: number;
};
export type TransportState = {
  compartments: Record<string, Compartment>;
  fluxes: TransportFlux[];
  cumulativeFluxes: TransportFlux[];
  mark: MealMark;
  metabolism: Record<string, MetabolicRate>;
  oxygenAbsorbed: number;
  oxygenConsumed: number;
  co2Produced: number;
  co2Exhaled: number;
  initialOxygen: number;
  initialCO2: number;
};
export type Sample = {
  time: number;
  heartRate: number;
  map: number;
  cardiacOutput: number;
  saturation: number;
  glucose: number;
  portalGlucose: number;
  hepaticGlucose: number;
  venousOxygen: number;
  oxygenConsumption: number;
  oxygenDebt: number;
  co2: number;
  temperature: number;
  plasma: number;
  urine: number;
  brainFlow: number;
  hormones: Record<Hormone, number>;
};
export type BodyState = {
  version: 3;
  time: number;
  inputs: Inputs;
  params: PersonalBaseline;
  /** Each hormone in arterial blood, against its resting level (1). */
  hormones: Record<Hormone, number>;
  /** Each hormone in every blood compartment, same scale: a gland's vein runs higher than the arteries. */
  hormoneBlood: Record<Hormone, Record<string, number>>;
  /** How fast each gland is releasing its hormone, against its resting rate (1). */
  secretion: Record<Hormone, number>;
  /** Each gland's resting release, in the units of `hormoneAmount`, per minute. */
  hormoneRate: Record<Hormone, number>;
  /** Hormone held in each blood compartment (concentration × volume). */
  hormoneAmount: Record<Hormone, Record<string, number>>;
  transport: TransportState;
  enzymes: Enzymes;
  digestionRates: { carbs: number; protein: number; fat: number };
  stomach: { carbs: number; protein: number; fat: number; water: number };
  gut: { carbs: number; protein: number; fat: number; water: number };
  glucoseMass: number;
  aminoAcids: number;
  lipids: number;
  glycogen: number;
  muscleGlycogen: number;
  /** When food (not just a drink) last reached the stomach, s; -1 before any. */
  lastFood: number;
  fatStore: number;
  proteinStore: number;
  plasma: number;
  interstitial: number;
  intracellular: number;
  sodium: number;
  urea: number;
  bladder: number;
  urineTotal: number;
  sodiumExcreted: number;
  insensibleLoss: number;
  metabolicWater: number;
  waterIn: number;
  carbIn: number;
  proteinIn: number;
  fatIn: number;
  glucoseSynthesized: number;
  glucoseUsed: number;
  glucoseExcreted: number;
  proteinUsed: number;
  fatUsed: number;
  heartRate: number;
  strokeVolume: number;
  cardiacOutput: number;
  map: number;
  respiratoryRate: number;
  tidalVolume: number;
  paO2: number;
  paCO2: number;
  saturation: number;
  oxygenConsumption: number;
  oxygenDemand: number;
  lungOxygenTarget: number;
  lungCO2Target: number;
  oxygenDelivered: number;
  oxygenDebt: number;
  inhaledOxygen: number;
  exhaledCO2: number;
  coreTemperature: number;
  sympathetic: number;
  parasympathetic: number;
  fatigue: number;
  osmolarity: number;
  gfr: number;
  urineRate: number;
  sweatRate: number;
  lymphRate: number;
  csf: number;
  flows: Flow[];
  queue: ScheduledAction[];
  receipts: Receipt[];
  nextId: number;
  history: Sample[];
  lastSample: number;
};
export type Scenario = {
  id: string;
  name: string;
  description: string;
  duration: number;
  events: { at: number; label: string; action: Action }[];
};
