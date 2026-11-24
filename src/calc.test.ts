import { describe, expect, it } from 'vitest';
import { computeTripCost, parseDecimal, tripDistance, validateConsumption, validatePrice } from './calc.ts';

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
