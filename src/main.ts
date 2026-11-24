import './style.css';
import { evaluateTrip, summarizeTrips, validatePrice } from './calc.ts';
import { createMap } from './map/map.ts';
import { EndpointMarkers } from './map/markers.ts';
import { RouteLayers } from './map/routeLayer.ts';
import { searchPlaces, type Place } from './services/geocoding.ts';
import { OsrmRoutingProvider, RoutingError, type RoutingProvider } from './services/routing.ts';
import {
  addRoute,
  createInitialState,
  removeRoute,
  restoreRoute,
  routeColor,
  routeName,
  setActiveRoute,
  Store,
  updateRoute,
  updateSettings,
  type AppState,
  type RemovedRoute,
  type TripRoute,
} from './state/store.ts';
import { createFuelSettings } from './ui/fuelSettings.ts';
import { RouteCard, type RouteCardCallbacks } from './ui/routeCard.ts';
import { createToaster } from './ui/toast.ts';
import { createTripsSummary } from './ui/tripsSummary.ts';

const mapContainer = document.getElementById('map');
const panelBody = document.getElementById('panel-body');
if (!mapContainer || !panelBody) {
  throw new Error('Missing #map or #panel-body container');
}

const map = createMap(mapContainer);
const markers = new EndpointMarkers(map);
const routeLayers = new RouteLayers(map);
const routing: RoutingProvider = new OsrmRoutingProvider();
const store = new Store(createInitialState());

/** In-flight routing request per route – a newer request for the same route cancels the old one. */
const controllers = new Map<string, AbortController>();
const cards = new Map<string, RouteCard>();
let hoveredId: string | null = null;

// ---------- Routing ----------

async function requestRoute(id: string): Promise<void> {
  controllers.get(id)?.abort();
  controllers.delete(id);

  const route = findRoute(id);
  if (!route) return;
  const { from, to } = route;

  if (!from || !to) {
    store.update((s) => updateRoute(s, id, { status: 'idle', result: null, error: null }));
    return;
  }
  if (isSamePlace(from, to)) {
    store.update((s) => updateRoute(s, id, { status: 'same-place', result: null, error: null }));
    return;
  }

  const controller = new AbortController();
  controllers.set(id, controller);
  store.update((s) => updateRoute(s, id, { status: 'loading', result: null, error: null }));

  try {
    const result = await routing.getRoute([from, to], controller.signal);
    if (controller.signal.aborted) return;
    store.update((s) => updateRoute(s, id, { status: 'ready', result }));
    routeLayers.fit([id]);
  } catch (err) {
    if (controller.signal.aborted) return;
    store.update((s) => updateRoute(s, id, { status: 'error', error: routingErrorMessage(err) }));
  } finally {
    if (controllers.get(id) === controller) controllers.delete(id);
  }
}

// ---------- Actions ----------

function activate(id: string, fit: boolean): void {
  store.update((s) => setActiveRoute(s, id));
  if (fit && !routeLayers.fit([id])) markers.frame(id);
}

function showAll(): void {
  store.update((s) => setActiveRoute(s, null));
  routeLayers.fit();
}

function addNewRoute(): void {
  store.update((s) => addRoute(s));
  const newest = store.get().routes.at(-1);
  const card = newest && cards.get(newest.id);
  if (card) {
    card.element.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    card.focusFrom();
  }
}

function removeWithUndo(id: string): void {
  controllers.get(id)?.abort();
  controllers.delete(id);
  if (hoveredId === id) hoveredId = null;

  const result = removeRoute(store.get(), id);
  const undo: RemovedRoute | null = result.removed;
  if (!undo) return;
  store.update(() => result.state);

  addButton.focus();
  toaster.show(`Usunięto „${routeName(undo.route)}”`, {
    label: 'Cofnij',
    onClick: () => {
      store.update((s) => restoreRoute(s, undo));
      // A request cancelled by the removal has to be repeated.
      if (undo.route.status === 'loading') void requestRoute(undo.route.id);
    },
  });
}

const callbacks: RouteCardCallbacks = {
  // Bias suggestions toward what the user is currently looking at on the map.
  search: (query, signal) => {
    const center = map.getCenter();
    return searchPlaces(query, { signal, near: { lon: center.lng, lat: center.lat }, zoom: map.getZoom() });
  },
  onEndpointsChange: (id, { from, to }) => {
    const prev = findRoute(id);
    store.update((s) => updateRoute(s, id, { from, to }));
    // Move the camera only when a place was picked (not when a field was just cleared).
    const picked = (from && from.id !== prev?.from?.id) || (to && to.id !== prev?.to?.id);
    if (picked) markers.frame(id);
    void requestRoute(id);
  },
  onRoundTripChange: (id, roundTrip) => store.update((s) => updateRoute(s, id, { roundTrip })),
  onNameChange: (id, name) => store.update((s) => updateRoute(s, id, { name })),
  onConsumptionChange: (id, consumption) => store.update((s) => updateRoute(s, id, { consumption })),
  onToggleCollapse: (id) => {
    const route = findRoute(id);
    if (route) store.update((s) => updateRoute(s, id, { collapsed: !route.collapsed }));
  },
  onRemove: removeWithUndo,
  onActivate: activate,
  onHover: (id) => {
    hoveredId = id;
    applyHighlight(store.get());
  },
  onRetry: (id) => void requestRoute(id),
};

// ---------- Static panel parts ----------

const routeList = document.createElement('div');
routeList.className = 'route-list';

const addButton = document.createElement('button');
addButton.type = 'button';
addButton.className = 'button button--add';
addButton.innerHTML = '<span aria-hidden="true">+</span> Dodaj trasę';
addButton.addEventListener('click', addNewRoute);

const fuelSettings = createFuelSettings({
  initial: store.get().settings,
  onChange: (patch) => store.update((s) => updateSettings(s, patch)),
});

const tripsSummary = createTripsSummary({
  onSelect: (id) => activate(id, true),
  onShowAll: showAll,
});

const toaster = createToaster(document.body);

panelBody.append(routeList, addButton, fuelSettings, tripsSummary.element);

// ---------- Render ----------

function render(state: AppState): void {
  const ids = new Set(state.routes.map((r) => r.id));
  const multiple = state.routes.length > 1;

  // Cards: drop removed ones, create new ones, keep DOM order in sync.
  for (const [id, card] of cards) {
    if (!ids.has(id)) {
      card.element.remove();
      cards.delete(id);
    }
  }
  state.routes.forEach((route, index) => {
    let card = cards.get(route.id);
    if (!card) {
      card = new RouteCard(route, callbacks);
      cards.set(route.id, card);
    }
    const current = routeList.children[index];
    if (current !== card.element) routeList.insertBefore(card.element, current ?? null);
  });

  const evaluations = state.routes.map((route) =>
    evaluateTrip({
      distanceKm: route.status === 'ready' && route.result ? route.result.distanceMeters / 1000 : null,
      roundTrip: route.roundTrip,
      consumptionOverride: route.consumption,
      globalConsumption: state.settings.consumption,
      price: state.settings.price,
    }),
  );

  state.routes.forEach((route, i) => {
    cards.get(route.id)?.update(route, evaluations[i]!, {
      active: multiple && route.id === state.activeRouteId,
      globalConsumption: state.settings.consumption,
    });
  });

  // Map: one colored line + A/B markers per route.
  routeLayers.retain(ids);
  markers.retain(ids);
  for (const route of state.routes) {
    const color = routeColor(route);
    routeLayers.set(route.id, route.status === 'ready' ? (route.result?.geometry ?? null) : null, color);
    markers.update(route.id, route.from, route.to, color);
  }
  applyHighlight(state);

  tripsSummary.update({
    items: state.routes.map((route, i) => ({
      id: route.id,
      name: routeName(route),
      color: routeColor(route),
      evaluation: evaluations[i]!,
    })),
    totals: summarizeTrips(evaluations),
    price: validatePrice(state.settings.price),
    fuelType: state.settings.fuelType,
  });
}

/** Hovered card wins over the selected one; with a single route nothing is dimmed. */
function applyHighlight(state: AppState): void {
  const id = state.routes.length > 1 ? (hoveredId ?? state.activeRouteId) : null;
  routeLayers.highlight(id);
  markers.highlight(id);
}

store.subscribe((state) => render(state));
render(store.get());

// ---------- Helpers ----------

function findRoute(id: string): TripRoute | undefined {
  return store.get().routes.find((r) => r.id === id);
}

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
