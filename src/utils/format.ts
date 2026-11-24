// Polish CLDR skips grouping for 4-digit numbers ("1234,6"); we want "1 234,6"
// everywhere, so every formatter forces `useGrouping: 'always'`.

const oneDecimal = new Intl.NumberFormat('pl-PL', {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
  useGrouping: 'always',
});

const upToTwoDecimals = new Intl.NumberFormat('pl-PL', {
  maximumFractionDigits: 2,
  useGrouping: 'always',
});

const currency = new Intl.NumberFormat('pl-PL', {
  style: 'currency',
  currency: 'PLN',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
  useGrouping: 'always',
});

/** 245.3 → "245,3 km", 1234.56 → "1 234,6 km" */
export function formatKm(km: number): string {
  return `${oneDecimal.format(km)} km`;
}

/** 245300 (meters) → "245,3 km" */
export function formatDistance(meters: number): string {
  return formatKm(meters / 1000);
}

/** 17.8 → "17,8 l" */
export function formatLiters(liters: number): string {
  return `${oneDecimal.format(liters)} l`;
}

/** 1234.5 → "1 234,50 zł" */
export function formatCurrency(amount: number): string {
  return currency.format(amount);
}

/** 7.5 → "7,5", 6.29 → "6,29", 7 → "7" – for echoing user-entered values. */
export function formatNumber(value: number): string {
  return upToTwoDecimals.format(value);
}

/** 8100 → "2 h 15 min", 2700 → "45 min", 7200 → "2 h" */
export function formatDuration(seconds: number): string {
  const totalMinutes = Math.max(1, Math.round(seconds / 60));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours === 0) return `${minutes} min`;
  if (minutes === 0) return `${hours} h`;
  return `${hours} h ${minutes} min`;
}
