import { describe, expect, it } from 'vitest';
import { formatCurrency, formatDistance, formatDuration, formatKm, formatLiters, formatNumber } from './format.ts';

// Intl uses non-breaking spaces as separators; normalize so expectations stay readable.
const plain = (s: string): string => s.replace(/[  ]/g, ' ');

describe('formatKm / formatDistance', () => {
  it('uses a decimal comma and one decimal place', () => {
    expect(plain(formatKm(245.3))).toBe('245,3 km');
    expect(plain(formatKm(7))).toBe('7,0 km');
    expect(plain(formatDistance(108980.3))).toBe('109,0 km');
  });

  it('groups thousands even for 4-digit numbers', () => {
    expect(plain(formatKm(1234.56))).toBe('1 234,6 km');
    expect(plain(formatDistance(1234567))).toBe('1 234,6 km');
  });
});

describe('formatCurrency', () => {
  it('formats PLN the Polish way', () => {
    expect(plain(formatCurrency(1234.56))).toBe('1 234,56 zł');
    expect(plain(formatCurrency(45.8))).toBe('45,80 zł');
    expect(plain(formatCurrency(0))).toBe('0,00 zł');
  });
});

describe('formatLiters / formatNumber', () => {
  it('formats liters with one decimal', () => {
    expect(plain(formatLiters(36.795))).toBe('36,8 l');
  });

  it('echoes user values without trailing zeros', () => {
    expect(formatNumber(7.5)).toBe('7,5');
    expect(formatNumber(6.29)).toBe('6,29');
    expect(formatNumber(7)).toBe('7');
  });
});

describe('formatDuration', () => {
  it.each([
    [30, '1 min'],
    [2700, '45 min'],
    [3600, '1 h'],
    [4547.5, '1 h 16 min'],
    [8100, '2 h 15 min'],
    [3599, '1 h'],
    [86400 + 600, '24 h 10 min'],
  ])('%d s → %s', (seconds, expected) => {
    expect(formatDuration(seconds)).toBe(expected);
  });
});
