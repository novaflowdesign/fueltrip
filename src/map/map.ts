import { AttributionControl, Map as MapLibreMap, NavigationControl, ScaleControl, setWorkerUrl } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
// MapLibre resolves its worker as "./maplibre-gl-worker.mjs" next to its own module.
// After bundling that file doesn't exist, so emit it as an asset and point MapLibre at it.
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';

setWorkerUrl(workerUrl);

/** OpenFreeMap vector style – free, no API key required. */
export const MAP_STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty';

/** Initial view: whole of Poland. */
const INITIAL_CENTER: [number, number] = [19.4, 52.0];
const INITIAL_ZOOM = 5.6;

export function createMap(container: HTMLElement): MapLibreMap {
  const map = new MapLibreMap({
    container,
    style: MAP_STYLE_URL,
    center: INITIAL_CENTER,
    zoom: INITIAL_ZOOM,
    // We add our own (always visible) attribution control below.
    attributionControl: false,
    cooperativeGestures: false,
  });

  map.addControl(new NavigationControl({ visualizePitch: true }), 'top-right');
  map.addControl(new ScaleControl({ unit: 'metric' }), 'bottom-right');
  // OpenFreeMap style already carries the OSM + OpenFreeMap attribution text.
  map.addControl(new AttributionControl({ compact: false }), 'bottom-right');

  // Keep the canvas sized correctly when the layout (panel/map split) changes.
  const resizeObserver = new ResizeObserver(() => map.resize());
  resizeObserver.observe(container);
  map.on('remove', () => resizeObserver.disconnect());

  return map;
}
