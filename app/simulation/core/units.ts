/** Canonical chemical units are mol, L and s. No implicit conversion of activities. */
export type Dimension = readonly [amount: number, volume: number, time: number];
export const DIMENSIONS = {
  amount: [1, 0, 0], volume: [0, 1, 0], time: [0, 0, 1],
  concentration: [1, -1, 0], firstOrder: [0, 0, -1],
  secondOrder: [-1, 1, -1], production: [1, -1, -1],
} as const;
const UNITS = {
  mol: [1, DIMENSIONS.amount], nmol: [1e-9, DIMENSIONS.amount], pmol: [1e-12, DIMENSIONS.amount],
  L: [1, DIMENSIONS.volume], mL: [1e-3, DIMENSIONS.volume],
  s: [1, DIMENSIONS.time], min: [60, DIMENSIONS.time],
  'mol/L': [1, DIMENSIONS.concentration], 'nmol/L': [1e-9, DIMENSIONS.concentration],
  'pmol/L': [1e-12, DIMENSIONS.concentration],
  '1/s': [1, DIMENSIONS.firstOrder], '1/min': [1 / 60, DIMENSIONS.firstOrder],
  'L/(mol*s)': [1, DIMENSIONS.secondOrder], 'L/(nmol*s)': [1e9, DIMENSIONS.secondOrder],
  'L/(mol*min)': [1 / 60, DIMENSIONS.secondOrder],
  'mol/(L*s)': [1, DIMENSIONS.production],
} as const satisfies Record<string, readonly [number, Dimension]>;
export type Unit = keyof typeof UNITS;
export type Quantity = {value: number; unit: Unit};
export function sameDimension(a: Dimension, b: Dimension): boolean {
  return a.every((value, i) => value === b[i]);
}
export function canonical(q: Quantity, dimension: Dimension, label = 'quantity'): number {
  if (!q || typeof q !== 'object' || !Object.hasOwn(UNITS, q.unit) || !Number.isFinite(q.value) || q.value < 0)
    throw new Error(`${label}: expected a finite nonnegative quantity with a supported physical unit.`);
  const [factor, actual] = UNITS[q.unit];
  if (!sameDimension(actual, dimension)) throw new Error(`${label}: incompatible unit ${q.unit}.`);
  const value = q.value * factor;
  if (!Number.isFinite(value)) throw new Error(`${label}: unit conversion overflow.`);
  return value;
}
export function rateDimension(order: number): Dimension {return [1 - order, order - 1, -1];}

