/**
 * Pure fuel-cost logic – no DOM, no map. Covered by `calc.test.ts`.
 */

export const CONSUMPTION_RANGE = { min: 1, max: 50 } as const;
export const PRICE_RANGE = { min: 0.5, max: 30 } as const;

export type FieldResult =
  | { status: 'ok'; value: number }
  | { status: 'empty' }
  | { status: 'invalid'; error: string };

/**
 * Parse a user-typed decimal. Accepts both "7,5" and "7.5", surrounding/inner
 * spaces ("1 234,5") and a trailing unit ("6,29 zł", "7,5 l").
 * Returns `null` for empty or malformed input (never silently 0).
 */
export function parseDecimal(input: string): number | null {
  const compact = input
    .replace(/[\s  ]/g, '')
    .replace(/(zł|zl|pln|l)$/i, '')
    .replace(',', '.');

  if (!/^-?(\d+\.?\d*|\.\d+)$/.test(compact)) return null;
  const value = Number(compact);
  return Number.isFinite(value) ? value : null;
}

export function validateConsumption(input: string): FieldResult {
  return validateRange(input, CONSUMPTION_RANGE, 'Spalanie', 'l/100 km', '7,5');
}

export function validatePrice(input: string): FieldResult {
  return validateRange(input, PRICE_RANGE, 'Cena', 'zł/l', '6,29');
}

function validateRange(
  input: string,
  range: { min: number; max: number },
  name: string,
  unit: string,
  example: string,
): FieldResult {
  if (input.trim() === '') return { status: 'empty' };

  const value = parseDecimal(input);
  if (value === null) return { status: 'invalid', error: `${name}: wpisz liczbę, np. ${example}` };

  if (value < range.min || value > range.max) {
    return {
      status: 'invalid',
      error: `${name} musi być między ${plNumber(range.min)} a ${plNumber(range.max)} ${unit}`,
    };
  }
  return { status: 'ok', value };
}

export interface TripCostInput {
  /** One-way driving distance in kilometers (as returned by routing). */
  distanceKm: number;
  roundTrip: boolean;
  /** Liters per 100 km. */
  consumption: number;
  /** PLN per liter. */
  price: number;
}

export interface TripCost extends TripDistance {
  liters: number;
  /** Rounded to full grosze. */
  cost: number;
}

export interface TripDistance {
  /** One-way distance rounded to 0.1 km – exactly what the UI displays. */
  oneWayKm: number;
  /** 1 or 2. */
  multiplier: number;
  /** oneWayKm × multiplier. */
  totalKm: number;
}

export function tripDistance(distanceKm: number, roundTrip: boolean): TripDistance {
  // Round the one-way distance first so the displayed "245,3 km × 2 = 490,6 km" always adds up.
  const oneWayKm = round(distanceKm, 1);
  const multiplier = roundTrip ? 2 : 1;
  return { oneWayKm, multiplier, totalKm: round(oneWayKm * multiplier, 1) };
}

/** koszt = km_łącznie × spalanie / 100 × cena */
export function computeTripCost({ distanceKm, roundTrip, consumption, price }: TripCostInput): TripCost {
  const { oneWayKm, multiplier, totalKm } = tripDistance(distanceKm, roundTrip);
  const liters = (totalKm * consumption) / 100;
  const cost = round(liters * price, 2);
  return { oneWayKm, multiplier, totalKm, liters, cost };
}

function round(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

function plNumber(value: number): string {
  return String(value).replace('.', ',');
}

export interface TripInput {
  /** One-way distance in km, or null when the route isn't calculated yet. */
  distanceKm: number | null;
  roundTrip: boolean;
  /** Per-route override as typed; empty → use `globalConsumption`. */
  consumptionOverride: string;
  globalConsumption: string;
  price: string;
}

export interface TripEvaluation {
  distance: TripDistance | null;
  /** Effective consumption (override if given, otherwise global). */
  consumption: FieldResult;
  consumptionSource: 'route' | 'global';
  price: FieldResult;
  /** Null when distance or consumption is missing/invalid. */
  liters: number | null;
  /** Null when liters or price is missing/invalid. */
  cost: number | null;
}

/** Everything the UI needs for one route card. */
export function evaluateTrip(input: TripInput): TripEvaluation {
  const hasOverride = input.consumptionOverride.trim() !== '';
  const consumption = validateConsumption(hasOverride ? input.consumptionOverride : input.globalConsumption);
  const price = validatePrice(input.price);
  const distance = input.distanceKm === null ? null : tripDistance(input.distanceKm, input.roundTrip);

  let liters: number | null = null;
  let cost: number | null = null;
  if (distance && consumption.status === 'ok') {
    const full = computeTripCost({
      distanceKm: input.distanceKm ?? 0,
      roundTrip: input.roundTrip,
      consumption: consumption.value,
      price: price.status === 'ok' ? price.value : 0,
    });
    liters = full.liters;
    cost = price.status === 'ok' ? full.cost : null;
  }

  return { distance, consumption, consumptionSource: hasOverride ? 'route' : 'global', price, liters, cost };
}

export interface TripsSummary {
  /** Routes with a calculated distance (included in totals). */
  includedCount: number;
  /** Routes without a distance yet (not included). */
  skippedCount: number;
  totalKm: number;
  /** Null if any included route has no liters (missing/invalid consumption). */
  liters: number | null;
  /**
   * Sum of the per-route costs as displayed (each rounded to grosze), so the
   * breakdown always adds up. Null if any included route has no cost.
   */
  cost: number | null;
}

export function summarizeTrips(trips: TripEvaluation[]): TripsSummary {
  const included = trips.filter((t) => t.distance !== null);
  const sum = (values: number[]): number => values.reduce((a, b) => a + b, 0);

  const liters = included.every((t) => t.liters !== null) ? sum(included.map((t) => t.liters ?? 0)) : null;
  const cost = included.every((t) => t.cost !== null) ? round(sum(included.map((t) => t.cost ?? 0)), 2) : null;

  return {
    includedCount: included.length,
    skippedCount: trips.length - included.length,
    totalKm: round(sum(included.map((t) => t.distance?.totalKm ?? 0)), 1),
    liters: included.length ? liters : null,
    cost: included.length ? cost : null,
  };
}
