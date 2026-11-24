import type { Map as MapLibreMap, PaddingOptions } from 'maplibre-gl';

/**
 * Part of the map covered from below by the mobile bottom sheet (px).
 * Camera moves add it to the bottom padding so routes don't hide under the sheet.
 */
let bottomInset = 0;

export function setBottomInset(px: number): void {
  bottomInset = Math.max(0, Math.round(px));
}

/**
 * Offset that centers a point in the part of the map above the sheet (for flyTo/jumpTo).
 * Deliberately not `padding`: MapLibre keeps camera padding on the map permanently and
 * adds it to every later fitBounds, which then can't fit on a phone screen.
 */
export function centerOffset(): [number, number] {
  return [0, -Math.round(bottomInset / 2)];
}

export function framePadding(map: MapLibreMap): PaddingOptions {
  const { clientWidth, clientHeight } = map.getContainer();
  const visibleHeight = Math.max(120, clientHeight - bottomInset);
  const base = Math.round(Math.min(90, clientWidth * 0.12, visibleHeight * 0.15));
  // Extra room at the top for the A/B pins (they stick up ~40 px above their point)
  // and at the bottom for the attribution + scale controls.
  return { top: base + 36, right: base, bottom: base + 28 + bottomInset, left: base };
}

export function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}
