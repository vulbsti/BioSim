import {
  NUTRIENTS,
  SUBSTANCES,
  type BodyState,
  type Compartment,
  type MealMark,
  type Nutrient,
  type Organ,
  type Substance,
  type TransportFlux,
  type TransportState,
} from "./types";

// Whole-blood volumes total 5 L. Solutes distribute through plasma (60%) and 11 L interstitium.
const beds: { id: Exclude<Organ, "lungs">; blood: number; tissue: number; name: string }[] = [
  { id: "heart", blood: 150, tissue: 200, name: "Heart" },
  { id: "brain", blood: 150, tissue: 500, name: "Brain" },
  { id: "liver", blood: 300, tissue: 700, name: "Liver" },
  { id: "gut", blood: 250, tissue: 1500, name: "Gut" },
  { id: "kidneys", blood: 200, tissue: 500, name: "Kidneys" },
  { id: "muscle", blood: 350, tissue: 4500, name: "Muscle" },
  { id: "skin", blood: 100, tissue: 1200, name: "Skin" },
  { id: "adipose", blood: 100, tissue: 1500, name: "Adipose" },
  { id: "endocrine", blood: 50, tissue: 400, name: "Other / endocrine" },
];
export const isGas = (species: Substance) => species === "oxygen" || species === "carbonDioxide";
export const distributionVolume = (c: Compartment, species: Substance) =>
  c.volume * (c.kind === "blood" && !isGas(species) ? 0.6 : 1);
export const concentration = (c: Compartment, species: Substance) =>
  c.amounts[species] / Math.max(1e-9, distributionVolume(c, species));
export const oxygenContent = (pressure: number) =>
  (0.201 * Math.pow(pressure, 2.7)) / (Math.pow(pressure, 2.7) + Math.pow(26.8, 2.7)) +
  0.00003 * pressure;
/** Places outside the compartments that can hold labelled meal nutrients. */
export const MARK_FATES = [
  "stomach",
  "intestinal lumen",
  "hepatic glycogen",
  "fat reserve",
  "protein reserve",
  "oxidized substrate",
  "gluconeogenesis",
  "urine",
] as const;
const unmarked = (): Record<Nutrient, number> => ({ glucose: 0, aminoAcids: 0, lipids: 0 });
const createMark = (ids: string[]): MealMark => ({
  at: -1,
  eaten: unmarked(),
  pools: Object.fromEntries([...ids, ...MARK_FATES].map((id) => [id, unmarked()])),
});
/** The newest meal takes the mark: earlier labels are dropped, and only this meal's grams are labelled. */
export function markMeal(s: BodyState, meal: { carbs: number; protein: number; fat: number }) {
  const mark = s.transport.mark;
  for (const pool of Object.values(mark.pools)) Object.assign(pool, unmarked());
  mark.at = s.time;
  mark.eaten = { glucose: meal.carbs, aminoAcids: meal.protein, lipids: meal.fat };
  mark.pools.stomach = { ...mark.eaten };
}
/**
 * Moves the meal label with `amount` leaving `from`, in proportion to the labelled share of the
 * source, whose size before the move is `sourceSize`. The label never changes an amount.
 */
export function carryMark(
  s: BodyState,
  from: string,
  to: string,
  species: Substance,
  amount: number,
  sourceSize: number,
) {
  const mark = s.transport.mark;
  if (mark.at < 0 || isGas(species) || amount <= 0 || sourceSize <= 0) return;
  const source = mark.pools[from],
    sink = mark.pools[to],
    key = species as Nutrient;
  if (!source || source[key] <= 0) return;
  const moved = Math.min(source[key], (amount * source[key]) / sourceSize);
  source[key] -= moved;
  if (sink) sink[key] += moved;
}
export function createTransport(): TransportState {
  const compartments: Record<string, Compartment> = {};
  const add = (
    id: string,
    name: string,
    kind: Compartment["kind"],
    organ: Organ | null,
    volume: number,
  ) => {
    const c: Compartment = {
      id,
      name,
      kind,
      organ,
      volume,
      amounts: { glucose: 0, aminoAcids: 0, lipids: 0, oxygen: 0, carbonDioxide: 0 },
    };
    if (kind !== "lymph") {
      const soluteVolume = distributionVolume(c, "glucose");
      c.amounts.glucose = soluteVolume * 0.0009;
      c.amounts.aminoAcids = (soluteVolume * 30) / 14000;
      c.amounts.lipids = (soluteVolume * 15) / 14000;
      if (kind === "blood") {
        c.amounts.oxygen =
          volume * (id === "arterial" || id === "lungs-blood" ? oxygenContent(98) : 0.15);
        c.amounts.carbonDioxide =
          volume * (id === "arterial" || id === "lungs-blood" ? 0.48 : 0.516);
      }
    }
    compartments[id] = c;
  };
  add("arterial", "Systemic arterial blood", "blood", null, 700);
  add("venous", "Mixed venous blood", "blood", null, 2050);
  add("lungs-blood", "Pulmonary blood", "blood", "lungs", 450);
  add("portal", "Hepatic portal blood", "blood", null, 150);
  for (const b of beds) {
    add(`${b.id}-blood`, `${b.name} blood`, "blood", b.id, b.blood);
    add(`${b.id}-tissue`, `${b.name} interstitium`, "tissue", b.id, b.tissue);
  }
  // Effective intracellular muscle pool used only by the opt-in P4 replacement.
  // It starts empty, so enabling the branch cannot create glucose inventory.
  add("muscle-cell", "Skeletal muscle intracellular glucose", "tissue", "muscle", 18000);
  for (const key of SUBSTANCES) compartments["muscle-cell"].amounts[key] = 0;
  // Radial shells of an optional refined muscle patch; empty unless the patch is active.
  for (let k = 0; k < 4; k++) {
    add(`muscle-cell-r${k}`, `Refined muscle patch shell ${k + 1} intracellular glucose`, "tissue", "muscle", 18000);
    for (const key of SUBSTANCES) compartments[`muscle-cell-r${k}`].amounts[key] = 0;
  }
  add("lymph", "Intestinal lymph lipid transit", "lymph", "gut", 100);
  const total = (key: Substance) =>
    Object.values(compartments).reduce((a, c) => a + c.amounts[key], 0);
  return {
    compartments,
    fluxes: [],
    cumulativeFluxes: [],
    mark: createMark(Object.keys(compartments)),
    metabolism: Object.fromEntries(
      beds.map((b) => [
        b.id,
        { glucose: 0, lipids: 0, oxygen: 0, oxygenDemand: 0, carbonDioxide: 0 },
      ]),
    ),
    oxygenAbsorbed: 0,
    oxygenConsumed: 0,
    co2Produced: 0,
    co2Exhaled: 0,
    initialOxygen: total("oxygen"),
    initialCO2: total("carbonDioxide"),
  };
}
export function totalSubstance(s: BodyState, species: Substance) {
  return Object.values(s.transport.compartments).reduce((a, c) => a + c.amounts[species], 0);
}
/** Labelled grams of each nutrient over every pool; equals what the marked meal contained. */
export function markedTotal(s: BodyState) {
  const total = unmarked();
  for (const pool of Object.values(s.transport.mark.pools)) for (const key of NUTRIENTS) total[key] += pool[key];
  return total;
}
export function syncNutrientTotals(s: BodyState) {
  s.glucoseMass = totalSubstance(s, "glucose");
  s.aminoAcids = totalSubstance(s, "aminoAcids");
  s.lipids = totalSubstance(s, "lipids");
}
export function gasResiduals(s: BodyState) {
  const t = s.transport;
  return {
    oxygen: totalSubstance(s, "oxygen") + t.oxygenConsumed - t.initialOxygen - t.oxygenAbsorbed,
    carbonDioxide: totalSubstance(s, "carbonDioxide") + t.co2Exhaled - t.initialCO2 - t.co2Produced,
  };
}
const fluxIndexes = new WeakMap<TransportFlux[], Map<string, TransportFlux>>();
export function logFlux(
  s: BodyState,
  from: string,
  to: string,
  substance: Substance,
  amount: number,
  mechanism: TransportFlux["mechanism"],
) {
  if (Math.abs(amount) < 1e-14) return;
  const id = `${from}:${to}:${substance}:${mechanism}`;
  for (const list of [s.transport.fluxes, s.transport.cumulativeFluxes]) {
    let index = fluxIndexes.get(list);
    if (!index) {
      index = new Map(list.map((f) => [f.id, f]));
      fluxIndexes.set(list, index);
    }
    const existing = index.get(id);
    if (existing) existing.amount += amount;
    else {
      const f = { id, from, to, substance, amount, mechanism };
      list.push(f);
      index.set(id, f);
    }
  }
}
/**
 * Transfers never create material; null source/sink is an explicitly recorded system boundary.
 * `reservoir` is the size of a source outside the compartments before this transfer, so the meal
 * label leaves it in proportion.
 */
export function transfer(
  s: BodyState,
  from: string,
  to: string,
  species: Substance,
  requested: number,
  mechanism: TransportFlux["mechanism"],
  reservoir = 0,
) {
  const a = s.transport.compartments[from];
  carryMark(s, from, to, species, Math.max(0, a ? Math.min(a.amounts[species], requested) : requested), a ? a.amounts[species] : reservoir);
  return move(s, from, to, species, requested, mechanism);
}
/** A transfer of amounts only; the caller accounts for the meal label. */
function move(
  s: BodyState,
  from: string,
  to: string,
  species: Substance,
  requested: number,
  mechanism: TransportFlux["mechanism"],
) {
  const a = s.transport.compartments[from],
    b = s.transport.compartments[to];
  const amount = Math.max(0, a ? Math.min(a.amounts[species], requested) : requested);
  if (a) a.amounts[species] -= amount;
  if (b) b.amounts[species] += amount;
  logFlux(s, from, to, species, amount, mechanism);
  return amount;
}
export function distributeWaterVolumes(s: BodyState) {
  const c = s.transport.compartments,
    ratio = s.plasma / 3000;
  c.arterial.volume = 700 * ratio;
  c.venous.volume = 2050 * ratio;
  c["lungs-blood"].volume = 450 * ratio;
  c.portal.volume = 150 * ratio;
  for (const b of beds) {
    c[`${b.id}-blood`].volume = b.blood * ratio;
    c[`${b.id}-tissue`].volume = (b.tissue * s.interstitial) / 11000;
  }
}

export function transportSubstances(s: BodyState, dt: number) {
  const c = s.transport.compartments;
  distributeWaterVolumes(s);
  const q = (id: Organ) => (s.flows.find((f) => f.id === id)?.flow ?? 0) * 1000;
  const edges: { from: string; to: string; flow: number }[] = [
    { from: "venous", to: "lungs-blood", flow: s.cardiacOutput * 1000 },
    { from: "lungs-blood", to: "arterial", flow: s.cardiacOutput * 1000 },
    { from: "portal", to: "liver-blood", flow: q("gut") },
  ];
  for (const b of beds) {
    edges.push({ from: "arterial", to: `${b.id}-blood`, flow: q(b.id) });
    edges.push({
      from: `${b.id}-blood`,
      to: b.id === "gut" ? "portal" : "venous",
      flow: q(b.id) + (b.id === "liver" ? q("gut") : 0),
    });
  }
  const outgoing: Record<string, number> = {};
  for (const e of edges) outgoing[e.from] = (outgoing[e.from] ?? 0) + e.flow;
  const maxFraction = Math.max(
    ...Object.entries(outgoing).map(([id, flow]) => (flow * dt) / Math.max(c[id].volume, 1)),
  );
  const steps = Math.max(1, Math.ceil(maxFraction / 0.25)),
    subdt = dt / steps;
  if (steps > 128) throw new Error("Circulating volume is outside the transport solver domain.");
  for (let step = 0; step < steps; step++) {
    // Compute from the same old concentrations, then apply together: iteration order cannot bias transport.
    const moves = edges.flatMap((e) =>
      SUBSTANCES.map((species) => ({
        from: e.from,
        to: e.to,
        species,
        amount: concentration(c[e.from], species) * e.flow * (isGas(species) ? 1 : 0.6) * subdt,
        size: c[e.from].amounts[species],
      })),
    );
    // Labels are read from the same old state as the amounts, then applied with them.
    const marks = moves.map((m) => m.size > 0 ? (s.transport.mark.pools[m.from][m.species as Nutrient] ?? 0) / m.size : 0);
    moves.forEach((move, i) => {
      if (marks[i] <= 0 || s.transport.mark.at < 0) return;
      const pools = s.transport.mark.pools, key = move.species as Nutrient;
      pools[move.from][key] -= move.amount * marks[i];
      pools[move.to][key] += move.amount * marks[i];
    });
    for (const move of moves) {
      c[move.from].amounts[move.species] -= move.amount;
      c[move.to].amounts[move.species] += move.amount;
      logFlux(s, move.from, move.to, move.species, move.amount, "advection");
    }
    // Finite permeability exchange. This represents capillary / interstitial transport, without cellular detail.
    for (const b of beds)
      for (const species of ["glucose", "aminoAcids", "lipids"] as const) {
        const blood = c[`${b.id}-blood`],
          tissue = c[`${b.id}-tissue`];
        const ps =
          (q(b.id) + (b.id === "liver" ? q("gut") : 0)) * 0.6 * (species === "lipids" ? 0.3 : 1.5);
        const gradient = concentration(blood, species) - concentration(tissue, species);
        const rate = gradient * ps;
        // Exact two-pool exchange prevents overshoot when permeability exceeds compartment turnover.
        const lambda =
          ps * (1 / distributionVolume(blood, species) + 1 / distributionVolume(tissue, species));
        const span = lambda ? -Math.expm1(-lambda * subdt) / lambda : subdt,
          amount = Math.abs(rate) * span;
        // The label crosses in both directions and settles on its own gradient, as a tracer does
        // even when the net movement is zero. It is read before the amounts move.
        const pools = s.transport.mark.pools,
          labelled =
            s.transport.mark.at < 0
              ? 0
              : (pools[blood.id][species] / distributionVolume(blood, species) -
                  pools[tissue.id][species] / distributionVolume(tissue, species)) *
                ps *
                span;
        move(
          s,
          rate >= 0 ? blood.id : tissue.id,
          rate >= 0 ? tissue.id : blood.id,
          species,
          amount,
          "exchange",
        );
        pools[blood.id][species] -= labelled;
        pools[tissue.id][species] += labelled;
      }
    transfer(
      s,
      "lymph",
      "venous",
      "lipids",
      c.lymph.amounts.lipids * -Math.expm1(-subdt / 35),
      "absorption",
    );
    const lungs = c["lungs-blood"],
      factor = -Math.expm1(-subdt / 0.005);
    const oxygen = (s.lungOxygenTarget - concentration(lungs, "oxygen")) * lungs.volume * factor;
    if (oxygen >= 0)
      s.transport.oxygenAbsorbed += transfer(
        s,
        "inspired air",
        "lungs-blood",
        "oxygen",
        Math.min(oxygen, s.respiratoryRate * s.tidalVolume * s.inputs.oxygen * subdt),
        "exchange",
      );
    else
      s.transport.oxygenAbsorbed -= transfer(
        s,
        "lungs-blood",
        "expired air",
        "oxygen",
        -oxygen,
        "exchange",
      );
    const co2 = (concentration(lungs, "carbonDioxide") - s.lungCO2Target) * lungs.volume * factor;
    if (co2 >= 0)
      s.transport.co2Exhaled += transfer(
        s,
        "lungs-blood",
        "expired air",
        "carbonDioxide",
        co2,
        "exchange",
      );
    else
      s.transport.co2Exhaled -= transfer(
        s,
        "inspired air",
        "lungs-blood",
        "carbonDioxide",
        -co2,
        "exchange",
      );
  }
  syncNutrientTotals(s);
}
export function updateBloodMeasurements(s: BodyState) {
  const c = s.transport.compartments,
    content = concentration(c.arterial, "oxygen");
  let low = 0,
    high = 500;
  for (let i = 0; i < 35; i++) {
    const mid = (low + high) / 2;
    if (oxygenContent(mid) < content) low = mid;
    else high = mid;
  }
  s.paO2 = (low + high) / 2;
  s.saturation = (100 * Math.pow(s.paO2, 2.7)) / (Math.pow(s.paO2, 2.7) + Math.pow(26.8, 2.7));
  s.paCO2 = Math.max(1, 40 + (concentration(c.arterial, "carbonDioxide") - 0.48) / 0.006);
  s.oxygenDelivered = s.cardiacOutput * 1000 * content;
  for (const f of s.flows) {
    const comp = c[`${f.id}-blood`];
    if (comp) f.venousO2 = concentration(comp, "oxygen") * 100;
    f.oxygenUse = s.transport.metabolism[f.id]?.oxygen ?? 0;
  }
}
