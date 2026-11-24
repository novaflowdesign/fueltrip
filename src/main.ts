import './style.css';
import { createMap } from './map/map.ts';
import { EndpointMarkers } from './map/markers.ts';
import { searchPlaces } from './services/geocoding.ts';
import { createRouteSearch, type RouteEndpoints } from './ui/routeSearch.ts';

const mapContainer = document.getElementById('map');
const panelBody = document.getElementById('panel-body');
if (!mapContainer || !panelBody) {
  throw new Error('Missing #map or #panel-body container');
}

const map = createMap(mapContainer);
const markers = new EndpointMarkers(map);

const hint = document.createElement('p');
hint.className = 'panel__hint';

function renderHint({ from, to }: RouteEndpoints): void {
  hint.textContent =
    from && to
      ? 'Start i cel wybrane. Wyznaczanie trasy pojawi się w następnym etapie.'
      : 'Wybierz miejsce startu i cel podróży.';
}

const routeSearch = createRouteSearch({
  // Bias suggestions toward what the user is currently looking at on the map.
  search: (query, signal) => {
    const center = map.getCenter();
    return searchPlaces(query, { signal, near: { lon: center.lng, lat: center.lat }, zoom: map.getZoom() });
  },
  onChange: (endpoints) => {
    markers.update(endpoints.from, endpoints.to);
    renderHint(endpoints);
  },
});

renderHint(routeSearch.getEndpoints());
panelBody.append(routeSearch.element, hint);
