export const HORMONES = [
  "insulin",
  "glucagon",
  "epinephrine",
  "norepinephrine",
  "crh",
  "acth",
  "cortisol",
  "trh",
  "tsh",
  "thyroid",
  "adh",
  "renin",
  "angiotensin",
  "aldosterone",
  "anp",
  "gastrin",
  "secretin",
  "cck",
  "glp1",
  "ghrelin",
  "leptin",
  "melatonin",
  "gh",
  "igf1",
  "gnrh",
  "lh",
  "fsh",
  "testosterone",
  "inhibin",
  "pth",
  "calcitriol",
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
export type Inputs = {
  exercise: number;
  oxygen: number;
  airCO2: number;
  temperature: number;
  light: number;
  sound: number;
  touch: number;
  pain: number;
  smell: number;
  sleep: number;
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
export type HormoneFlux = { target: number; secretion: number; clearance: number };
export type Flow = { id: Organ; name: string; flow: number; oxygenUse: number; venousO2: number };
export const SUBSTANCES = ["glucose", "aminoAcids", "lipids", "oxygen", "carbonDioxide"] as const;
export type Substance = (typeof SUBSTANCES)[number];
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
  version: 2;
  time: number;
  inputs: Inputs;
  hormones: Record<Hormone, number>;
  hormoneFlux: Record<Hormone, HormoneFlux>;
  transport: TransportState;
  multiscaleMeal: MultiscaleMealState;
  enzymes: Enzymes;
  digestionRates: { carbs: number; protein: number; fat: number };
  stomach: { carbs: number; protein: number; fat: number; water: number };
  gut: { carbs: number; protein: number; fat: number; water: number };
  glucoseMass: number;
  aminoAcids: number;
  lipids: number;
  glycogen: number;
  fatStore: number;
  proteinStore: number;
  plasma: number;
  interstitial: number;
  intracellular: number;
  sodium: number;
  urea: number;
  calcium: number;
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
export type MultiscaleMealState = {
  enabled: boolean;
  version: string;
  solver: string;
  sensitivity: 1 | 0.35 | 0;
  circulation: number[];
  /** Body blood volumes adopted as circuit pressure references when the pathway was enabled, L. */
  referenceVolumesL: number[];
  /** Mean circuit branch flows over the last completed 30 s block, L/s, in BLOOD_EDGES order. */
  meanFlowsLPerS: number[];
  /** Branch volume accumulated in the current block, L, and its elapsed seconds. */
  flowWindowL: number[];
  flowWindowSeconds: number;
  /** Integrated cardiac cycle phase in [0, 1). */
  pumpPhase: number;
  /** Beta-cell secretion model state (models/dallaman2007): Y pmol/kg/min, Ipo pmol/kg, previous G mg/dL. */
  betaCell: { Y: number; Ipo: number; previousG: number };
  secretedPmol: number;
  /** Basal insulin inventory placed in the circuit when the pathway was enabled, pmol. */
  primedPmol: number;
  muscleUptakeG: number;
  lastSecretionPmolPerMin: number;
  lastUptakeMgPerMin: number;
  /** Fraction of the muscle population running as the refined radial patch; 0 when coarse. */
  patchFraction: number;
  patchInsulinMol: number[];
  patchSignal: number[][];
  patchClearedMol: number;
  patchUptakeG: number;
};
