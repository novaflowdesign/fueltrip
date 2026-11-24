import {
  AttributionControl,
  Map as MapLibreMap,
  NavigationControl,
  ScaleControl,
  setWorkerUrl,
  type ExpressionSpecification,
} from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
// MapLibre resolves its worker as "./maplibre-gl-worker.mjs" next to its own module.
// After bundling that file doesn't exist, so emit it as an asset and point MapLibre at it.
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';
import { centerOffset, prefersReducedMotion } from './viewport.ts';

setWorkerUrl(workerUrl);

/** OpenFreeMap vector styles – free, no API key required. */
export const MAP_STYLES = {
  light: 'https://tiles.openfreemap.org/styles/liberty',
  dark: 'https://tiles.openfreemap.org/styles/dark',
} as const;

export type MapTheme = keyof typeof MAP_STYLES;

/** Initial view: whole of Poland. */
const INITIAL_CENTER: [number, number] = [19.4, 52.0];
const INITIAL_ZOOM = 5.6;

export function createMap(container: HTMLElement, theme: MapTheme): MapLibreMap {
  const map = new MapLibreMap({
    container,
    style: MAP_STYLES[theme],
    center: INITIAL_CENTER,
    zoom: INITIAL_ZOOM,
    // We add our own (always visible) attribution control below.
    attributionControl: false,
    cooperativeGestures: false,
  });

  map.addControl(new NavigationControl({ visualizePitch: true }), 'top-right');
  map.addControl(new ScaleControl({ unit: 'metric' }), 'bottom-right');
  // OpenFreeMap style already carries the OSM + OpenFreeMap attribution text.
  // Full text on wide screens; on phones MapLibre's compact "i" version (shown expanded at start).
  map.addControl(
    new AttributionControl({ compact: window.matchMedia('(max-width: 760px)').matches }),
    'bottom-right',
  );

  map.on('style.load', () => localizeLabels(map));

  // Keep the canvas sized correctly when the layout (panel/map split) changes.
  const resizeObserver = new ResizeObserver(() => map.resize());
  resizeObserver.observe(container);
  map.on('remove', () => resizeObserver.disconnect());

  return map;
}

/** Swap the base map between light and dark (route layers re-add themselves on `style.load`). */
export function setMapTheme(map: MapLibreMap, theme: MapTheme): void {
  map.setStyle(MAP_STYLES[theme], { diff: false });
}

/** Fly back to the initial overview of Poland. */
export function resetView(map: MapLibreMap): void {
  map.flyTo({
    center: INITIAL_CENTER,
    zoom: INITIAL_ZOOM,
    bearing: 0,
    pitch: 0,
    offset: centerOffset(),
    duration: prefersReducedMotion() ? 0 : 1200,
  });
}

/**
 * The Liberty style prefers English names (`name_en` → "Krakow", "Bielsko-Biala").
 * Switch place labels to Polish names where available ("Wiedeń", "Niemcy"),
 * falling back to the Latin-script / local name ("Kraków"). Road refs (A4, S7) are untouched.
 */
const POLISH_LABEL: ExpressionSpecification = ['coalesce', ['get', 'name:pl'], ['get', 'name:latin'], ['get', 'name']];

function localizeLabels(map: MapLibreMap): void {
  for (const layer of map.getStyle().layers) {
    if (layer.type !== 'symbol') continue;
    const textField = map.getLayoutProperty(layer.id, 'text-field');
    if (textField !== undefined && JSON.stringify(textField).includes('"name')) {
      map.setLayoutProperty(layer.id, 'text-field', POLISH_LABEL);
    }
  }
}
