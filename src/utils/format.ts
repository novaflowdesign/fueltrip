const kmFormatter = new Intl.NumberFormat('pl-PL', {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
  // Polish CLDR skips grouping for 4-digit numbers ("1234,6"); we want "1 234,6".
  useGrouping: 'always',
});

/** 245300 → "245,3 km", 1234567 → "1 234,6 km" */
export function formatDistance(meters: number): string {
  return `${kmFormatter.format(meters / 1000)} km`;
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
