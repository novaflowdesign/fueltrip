import './style.css';
import { createMap } from './map/map.ts';
import { EndpointMarkers } from './map/markers.ts';
import { RouteLayer } from './map/routeLayer.ts';
import { searchPlaces, type Place } from './services/geocoding.ts';
import { OsrmRoutingProvider, RoutingError, type RouteResult, type RoutingProvider } from './services/routing.ts';
import { createCostSummary } from './ui/costSummary.ts';
import { createFuelSettings } from './ui/fuelSettings.ts';
import { createRouteSearch, type RouteEndpoints } from './ui/routeSearch.ts';
import { createRouteSummary } from './ui/routeSummary.ts';

const mapContainer = document.getElementById('map');
const panelBody = document.getElementById('panel-body');
if (!mapContainer || !panelBody) {
  throw new Error('Missing #map or #panel-body container');
}

const map = createMap(mapContainer);
const markers = new EndpointMarkers(map);
const routeLayer = new RouteLayer(map);
const routing: RoutingProvider = new OsrmRoutingProvider();

let routeController: AbortController | null = null;
let currentRoute: RouteResult | null = null;
let roundTrip = false;

const summary = createRouteSummary({
  onRoundTripChange: (value) => {
    roundTrip = value;
    renderCost();
  },
});

const fuelSettings = createFuelSettings({
  initial: { consumption: '7,5', price: '', fuelType: 'pb95' },
  onChange: () => renderCost(),
});

const costSummary = createCostSummary();

function renderCost(): void {
  costSummary.update({ route: currentRoute, roundTrip, settings: fuelSettings.getValue() });
}

function setRoute(route: RouteResult | null): void {
  currentRoute = route;
  renderCost();
}

async function updateRoute({ from, to }: RouteEndpoints): Promise<void> {
  // A newer selection always wins over an in-flight request.
  routeController?.abort();
  routeController = null;
  routeLayer.clear();
  setRoute(null);

  if (!from || !to) {
    summary.showIdle('Wybierz miejsce startu i cel podróży.');
    return;
  }

  if (isSamePlace(from, to)) {
    summary.showMessage('Start i cel to to samo miejsce. Wybierz inny cel podróży.');
    return;
  }

  const controller = new AbortController();
  routeController = controller;
  summary.showLoading();

  try {
    const route = await routing.getRoute([from, to], controller.signal);
    if (controller.signal.aborted) return;
    summary.showRoute(route);
    setRoute(route);
    void routeLayer.show(route.geometry);
  } catch (err) {
    if (controller.signal.aborted) return;
    summary.showError(routingErrorMessage(err), () => void updateRoute(routeSearch.getEndpoints()));
  } finally {
    if (routeController === controller) routeController = null;
  }
}

const routeSearch = createRouteSearch({
  // Bias suggestions toward what the user is currently looking at on the map.
  search: (query, signal) => {
    const center = map.getCenter();
    return searchPlaces(query, { signal, near: { lon: center.lng, lat: center.lat }, zoom: map.getZoom() });
  },
  onChange: (endpoints) => {
    markers.update(endpoints.from, endpoints.to);
    void updateRoute(endpoints);
  },
});

panelBody.append(routeSearch.element, summary.element, fuelSettings.element, costSummary.element);
void updateRoute(routeSearch.getEndpoints());

function isSamePlace(a: Place, b: Place): boolean {
  // ~50 m tolerance – different OSM objects can sit at the same spot.
  return a.id === b.id || (Math.abs(a.lat - b.lat) < 0.0005 && Math.abs(a.lon - b.lon) < 0.0005);
}

function routingErrorMessage(err: unknown): string {
  if (err instanceof RoutingError) {
    switch (err.kind) {
      case 'no-route':
        return 'Nie znaleziono trasy samochodowej między tymi punktami.';
      case 'timeout':
        return 'Serwer tras nie odpowiada. Spróbuj ponownie za chwilę.';
      case 'network':
        return navigator.onLine
          ? 'Nie udało się połączyć z serwerem tras.'
          : 'Brak połączenia z internetem.';
      case 'http':
        return 'Serwer tras zwrócił błąd. Spróbuj ponownie za chwilę.';
    }
  }
  return 'Nie udało się wyznaczyć trasy.';
}
