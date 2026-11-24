import { describe, expect, it } from 'vitest';
import {
  computeTripCost,
  evaluateTrip,
  parseDecimal,
  splitCost,
  summarizeTrips,
  tripDistance,
  validateConsumption,
  validatePrice,
} from './calc.ts';

describe('parseDecimal', () => {
  it.each([
    ['7,5', 7.5],
    ['7.5', 7.5],
    ['7', 7],
    [' 6,29 ', 6.29],
    ['6,29 zł', 6.29],
    ['6.29zl', 6.29],
    ['7,5 l', 7.5],
    ['1 234,5', 1234.5],
    ['1 234,5', 1234.5],
    [',5', 0.5],
    ['5,', 5],
    ['-3', -3],
    ['0', 0],
  ])('parses %j → %d', (input, expected) => {
    expect(parseDecimal(input)).toBe(expected);
  });

  it.each(['', '   ', 'abc', '7,5,1', '7.5.1', '1,2.3', 'zł', '--1', '7a', '.'])(
    'rejects %j',
    (input) => {
      expect(parseDecimal(input)).toBeNull();
    },
  );
});

describe('validateConsumption', () => {
  it('accepts a value in range', () => {
    expect(validateConsumption('7,5')).toEqual({ status: 'ok', value: 7.5 });
  });

  it('accepts range boundaries', () => {
    expect(validateConsumption('1')).toEqual({ status: 'ok', value: 1 });
    expect(validateConsumption('50')).toEqual({ status: 'ok', value: 50 });
  });

  it('reports empty input separately from invalid input', () => {
    expect(validateConsumption('')).toEqual({ status: 'empty' });
    expect(validateConsumption('  ')).toEqual({ status: 'empty' });
  });

  it('rejects non-numbers with a hint', () => {
    const result = validateConsumption('dużo');
    expect(result.status).toBe('invalid');
    expect(result.status === 'invalid' && result.error).toContain('7,5');
  });

  it.each(['0', '0,9', '51', '-5'])('rejects out-of-range %j', (input) => {
    const result = validateConsumption(input);
    expect(result).toEqual({ status: 'invalid', error: 'Spalanie musi być między 1 a 50 l/100 km' });
  });
});

describe('validatePrice', () => {
  it('accepts comma and dot', () => {
    expect(validatePrice('6,29')).toEqual({ status: 'ok', value: 6.29 });
    expect(validatePrice('6.29')).toEqual({ status: 'ok', value: 6.29 });
  });

  it.each(['0,49', '31', '0'])('rejects out-of-range %j', (input) => {
    expect(validatePrice(input)).toEqual({ status: 'invalid', error: 'Cena musi być między 0,5 a 30 zł/l' });
  });
});

describe('computeTripCost', () => {
  it('applies koszt = km × spalanie / 100 × cena', () => {
    const result = computeTripCost({ distanceKm: 100, roundTrip: false, consumption: 7.5, price: 6 });
    expect(result).toEqual({ oneWayKm: 100, multiplier: 1, totalKm: 100, liters: 7.5, cost: 45 });
  });

  it('doubles the distance for a round trip', () => {
    const result = computeTripCost({ distanceKm: 245.3, roundTrip: true, consumption: 7.5, price: 6.29 });
    expect(result.multiplier).toBe(2);
    expect(result.totalKm).toBe(490.6);
    expect(result.liters).toBeCloseTo(36.795, 10);
    expect(result.cost).toBe(231.44); // 36.795 × 6.29 = 231.44055
  });

  it('rounds one-way km first so "X × 2 = Y" adds up on screen', () => {
    // 245.34 → shown as 245,3; doubling the raw value would give 490,7 (490.68).
    const result = computeTripCost({ distanceKm: 245.34, roundTrip: true, consumption: 5, price: 6 });
    expect(result.oneWayKm).toBe(245.3);
    expect(result.totalKm).toBe(490.6);
  });

  it('rounds cost to full grosze, including .5 edge cases', () => {
    // 10 km × 5 l/100 km = 0.5 l × 2.01 zł = 1.005 zł → 1.01 (not 1.00 from float error)
    const result = computeTripCost({ distanceKm: 10, roundTrip: false, consumption: 5, price: 2.01 });
    expect(result.cost).toBe(1.01);
  });

  it('returns zero cost for zero distance', () => {
    expect(computeTripCost({ distanceKm: 0, roundTrip: true, consumption: 7, price: 6 }).cost).toBe(0);
  });

  it('handles a realistic route (Gliwice → Kraków)', () => {
    const result = computeTripCost({ distanceKm: 108.98, roundTrip: false, consumption: 6.8, price: 6.19 });
    expect(result.totalKm).toBe(109);
    expect(result.liters).toBeCloseTo(7.412, 10);
    expect(result.cost).toBe(45.88); // 7.412 × 6.19 = 45.88028
  });
});

describe('tripDistance', () => {
  it('keeps one-way distance for a single trip', () => {
    expect(tripDistance(118.66, false)).toEqual({ oneWayKm: 118.7, multiplier: 1, totalKm: 118.7 });
  });

  it('doubles the rounded one-way distance for a round trip', () => {
    expect(tripDistance(118.66, true)).toEqual({ oneWayKm: 118.7, multiplier: 2, totalKm: 237.4 });
  });
});

describe('evaluateTrip', () => {
  const base = { distanceKm: 100, roundTrip: false, consumption: '7,5', fuelType: 'pb95' as const, price: '6' };

  it('computes liters and cost from the car consumption and its fuel price', () => {
    const e = evaluateTrip(base);
    expect(e.liters).toBe(7.5);
    expect(e.cost).toBe(45);
    expect(e.fuelType).toBe('pb95');
  });

  it('reports invalid consumption instead of guessing', () => {
    const e = evaluateTrip({ ...base, consumption: '99' });
    expect(e.consumption.status).toBe('invalid');
    expect(e.liters).toBeNull();
    expect(e.cost).toBeNull();
  });

  it('gives liters but no cost when the price is missing', () => {
    const e = evaluateTrip({ ...base, price: '' });
    expect(e.liters).toBe(7.5);
    expect(e.cost).toBeNull();
    expect(e.price.status).toBe('empty');
  });

  it('has no distance, liters or cost before the route is calculated', () => {
    const e = evaluateTrip({ ...base, distanceKm: null });
    expect(e.distance).toBeNull();
    expect(e.liters).toBeNull();
    expect(e.cost).toBeNull();
  });

  it('applies the round trip', () => {
    const e = evaluateTrip({ ...base, roundTrip: true });
    expect(e.distance).toEqual({ oneWayKm: 100, multiplier: 2, totalKm: 200 });
    expect(e.cost).toBe(90);
  });
});

describe('summarizeTrips', () => {
  type Extra = Partial<Parameters<typeof evaluateTrip>[0]>;
  const trip = (distanceKm: number | null, extra: Extra = {}) =>
    evaluateTrip({ distanceKm, roundTrip: false, consumption: '7,5', fuelType: 'pb95', price: '6,29', ...extra });

  it('sums distance, liters and cost of calculated routes', () => {
    const s = summarizeTrips([trip(118.7), trip(100, { roundTrip: true }), trip(50, { consumption: '5' })]);
    expect(s.includedCount).toBe(3);
    expect(s.totalKm).toBe(368.7); // 118.7 + 200 + 50
    expect(s.liters).toBeCloseTo(8.9025 + 15 + 2.5, 10);
    // per-route rounded: 56.00 + 94.35 + 15.73
    expect(s.cost).toBe(166.08);
  });

  it('prices every route with its own fuel and groups liters by fuel', () => {
    const s = summarizeTrips([
      trip(100, { consumption: '6', fuelType: 'pb95', price: '6,50' }), // 6 l × 6.50 = 39.00
      trip(100, { consumption: '10', fuelType: 'lpg', price: '3,10' }), // 10 l × 3.10 = 31.00
      trip(50, { consumption: '8', fuelType: 'pb95', price: '6,50' }), // 4 l × 6.50 = 26.00
    ]);
    expect(s.cost).toBe(96);
    expect(s.litersByFuel).toEqual({ pb95: 10, lpg: 10 });
    expect(s.fuelsMissingPrice).toEqual([]);
  });

  it('lists the fuels whose price is missing', () => {
    const s = summarizeTrips([trip(100), trip(100, { fuelType: 'lpg', price: '' }), trip(null, { fuelType: 'on', price: '' })]);
    expect(s.cost).toBeNull();
    expect(s.fuelsMissingPrice).toEqual(['lpg']); // ON route isn't calculated yet → not needed
  });

  it('adds up the displayed (rounded) per-route costs', () => {
    // each: 10 km × 5 l/100 km × 2.01 = 1.005 → 1.01; three of them → 3.03 (not 3.02 from 3.015)
    const trips = [1, 2, 3].map(() => trip(10, { consumption: '5', price: '2,01' }));
    expect(summarizeTrips(trips).cost).toBe(3.03);
  });

  it('skips routes without a distance', () => {
    const s = summarizeTrips([trip(100), trip(null)]);
    expect(s.includedCount).toBe(1);
    expect(s.skippedCount).toBe(1);
    expect(s.totalKm).toBe(100);
  });

  it('has no total cost or liters if any included route lacks consumption', () => {
    const s = summarizeTrips([trip(100), trip(100, { consumption: 'abc' })]);
    expect(s.totalKm).toBe(200);
    expect(s.liters).toBeNull();
    expect(s.litersByFuel).toEqual({});
    expect(s.cost).toBeNull();
  });

  it('is empty when nothing is calculated', () => {
    const empty = { includedCount: 0, totalKm: 0, liters: null, litersByFuel: {}, cost: null, fuelsMissingPrice: [] };
    expect(summarizeTrips([trip(null)])).toEqual({ ...empty, skippedCount: 1 });
    expect(summarizeTrips([])).toEqual({ ...empty, skippedCount: 0 });
  });
});

describe('splitCost', () => {
  it('splits evenly when possible', () => {
    expect(splitCost(100, 4)).toEqual({ people: 4, perPerson: 25, collected: 100 });
  });

  it('rounds up to full grosze so payments cover the cost', () => {
    expect(splitCost(100, 3)).toEqual({ people: 3, perPerson: 33.34, collected: 100.02 });
    expect(splitCost(203.46, 2)).toEqual({ people: 2, perPerson: 101.73, collected: 203.46 });
    expect(splitCost(342.92, 3)).toEqual({ people: 3, perPerson: 114.31, collected: 342.93 });
  });

  it('is exact in grosze despite float noise', () => {
    expect(splitCost(0.1 + 0.2, 1)).toEqual({ people: 1, perPerson: 0.3, collected: 0.3 });
  });

  it('clamps the number of people to 1–20', () => {
    expect(splitCost(50, 0).people).toBe(1);
    expect(splitCost(50, -3).people).toBe(1);
    expect(splitCost(50, 99).people).toBe(20);
    expect(splitCost(50, 2.7).people).toBe(2);
  });
});
