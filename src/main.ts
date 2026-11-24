import '@fontsource-variable/manrope';
import './style.css';
import { evaluateTrip, summarizeTrips } from './calc.ts';
import { createMap, resetView, setMapTheme } from './map/map.ts';
import { setBottomInset } from './map/viewport.ts';
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
  setPeople,
  Store,
  updateRoute,
  addCar,
  updateCar,
  removeCar,
  setPrice,
  resolveCar,
  routePoints,
  type AppState,
  type RemovedRoute,
  type TripRoute,
} from './state/store.ts';
import { clearState, getStorage, loadState, saveState } from './state/persistence.ts';
import { createBottomSheet } from './ui/bottomSheet.ts';
import { createClearAll } from './ui/clearAll.ts';
import { forgetNumber } from './ui/countUp.ts';
import { createFuelSettings } from './ui/fuelSettings.ts';
import { RouteCard, type RouteCardCallbacks } from './ui/routeCard.ts';
import { createThemeSwitch } from './ui/theme.ts';
import { createToaster } from './ui/toast.ts';
import { createTripsSummary } from './ui/tripsSummary.ts';
import { debounce } from './utils/debounce.ts';
import { formatCurrency, formatKm } from './utils/format.ts';

const byId = <T extends HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing #${id}`);
  return el as T;
};
const mapContainer = byId('map');
const panel = byId('panel');
const panelHeader = byId('panel-header');
const panelBody = byId('panel-body');
const sheetPeek = byId('sheet-peek');

// Theme first, so the map starts with the matching style.
const themeSwitch = createThemeSwitch((theme) => setMapTheme(map, theme));
byId('theme-slot').append(themeSwitch.element);

const map = createMap(mapContainer, themeSwitch.current());
// Dev-only handle for debugging in the browser console / automated checks.
if (import.meta.env.DEV) (window as unknown as { __map: typeof map }).__map = map;

// On phones the panel is a bottom sheet over the map; camera moves keep routes above it.
createBottomSheet({
  panel,
  header: panelHeader,
  handle: byId<HTMLButtonElement>('sheet-handle'),
  onInsetChange: setBottomInset,
});
const markers = new EndpointMarkers(map);
const routeLayers = new RouteLayers(map);
const routing: RoutingProvider = new OsrmRoutingProvider();
// localStorage may be unavailable (private mode, blocked cookies) – the app then works in memory only.
const storage = getStorage();
const restored = storage ? loadState(storage) : null;
const store = new Store(restored ?? createInitialState());

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
  const points = routePoints(route);

  if (!points) {
    store.update((s) => updateRoute(s, id, { status: 'idle', result: null, error: null }));
    return;
  }
  // A→A is only meaningless without stops (with stops it's a valid loop).
  if (points.length === 2 && isSamePlace(points[0]!, points[1]!)) {
    store.update((s) => updateRoute(s, id, { status: 'same-place', result: null, error: null }));
    return;
  }

  const controller = new AbortController();
  controllers.set(id, controller);
  store.update((s) => updateRoute(s, id, { status: 'loading', result: null, error: null }));

  try {
    const result = await routing.getRoute(points, controller.signal);
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
  onEndpointsChange: (id, { from, to, stops }) => {
    const prev = findRoute(id);
    store.update((s) => updateRoute(s, id, { from, to, stops }));
    const next = findRoute(id);
    if (!prev || !next) return;

    // Move the camera only when a place was picked (not when a field was just cleared).
    const prevIds = new Set([prev.from, prev.to, ...prev.stops.map((s) => s.place)].map((p) => p?.id));
    const picked = [from, to, ...stops.map((s) => s.place)].some((p) => p && !prevIds.has(p.id));
    if (picked) markers.frame(id);

    // Adding an empty stop or reordering nothing doesn't change the route – don't re-request it.
    const key = (r: TripRoute): string => routePoints(r)?.map((p) => p.id).join('>') ?? '';
    if (key(prev) !== key(next) || next.status === 'idle' || next.status === 'error') void requestRoute(id);
  },
  onRoundTripChange: (id, roundTrip) => store.update((s) => updateRoute(s, id, { roundTrip })),
  onNameChange: (id, name) => store.update((s) => updateRoute(s, id, { name })),
  onConsumptionChange: (id, consumption) => store.update((s) => updateRoute(s, id, { consumption })),
  onCarChange: (id, carId) => store.update((s) => updateRoute(s, id, { carId })),
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
  onAddCar: () => {
    const { state, id } = addCar(store.get());
    store.update(() => state);
    // Start editing the new car's name right away.
    document.querySelector<HTMLInputElement>(`#car-${CSS.escape(id)}-consumption`)
      ?.closest('.car-row')
      ?.querySelector<HTMLInputElement>('.car-row__name')
      ?.select();
  },
  onUpdateCar: (id, patch) => store.update((s) => updateCar(s, id, patch)),
  onRemoveCar: (id) => {
    const car = store.get().cars.find((c) => c.id === id);
    store.update((s) => removeCar(s, id));
    if (car) toaster.show(`Usunięto auto „${car.name}”. Trasy, które go używały, jadą teraz domyślnym autem.`);
  },
  onPriceChange: (fuel, value) => store.update((s) => setPrice(s, fuel, value)),
});

const tripsSummary = createTripsSummary({
  onSelect: (id) => activate(id, true),
  onShowAll: showAll,
  onPeopleChange: (people) => store.update((s) => setPeople(s, people)),
});

const toaster = createToaster(document.body);

const clearAll = createClearAll({ onConfirm: clearEverything });

panelBody.append(routeList, addButton, fuelSettings.element, tripsSummary.element, clearAll);

function clearEverything(): void {
  for (const controller of controllers.values()) controller.abort();
  controllers.clear();
  hoveredId = null;

  const fresh = createInitialState();
  store.update(() => fresh);
  // Drop the save scheduled by the update above – storage stays empty until the next real change.
  saveNow.cancel();
  if (storage) clearState(storage);

  resetView(map);
  toaster.show('Wyczyszczono wszystkie trasy i ustawienia.');
}

// ---------- Render ----------

function render(state: AppState): void {
  const ids = new Set(state.routes.map((r) => r.id));
  const multiple = state.routes.length > 1;

  // Cards: drop removed ones, create new ones, keep DOM order in sync.
  for (const [id, card] of cards) {
    if (!ids.has(id)) {
      card.element.remove();
      cards.delete(id);
      for (const key of [`route-cost-${id}`, `route-${id}-km`, `route-${id}-min`]) forgetNumber(key);
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

  // Each route is priced with its own car's consumption and that car's fuel price.
  const resolved = state.routes.map((route) => resolveCar(state, route));
  const evaluations = state.routes.map((route, i) =>
    evaluateTrip({
      distanceKm: route.status === 'ready' && route.result ? route.result.distanceMeters / 1000 : null,
      roundTrip: route.roundTrip,
      consumption: resolved[i]!.consumption,
      fuelType: resolved[i]!.fuelType,
      price: state.settings.prices[resolved[i]!.fuelType],
    }),
  );

  state.routes.forEach((route, i) => {
    cards.get(route.id)?.update(route, evaluations[i]!, {
      active: multiple && route.id === state.activeRouteId,
      cars: state.cars,
      resolved: resolved[i]!,
    });
  });

  fuelSettings.update(state);

  // Map: one colored line + A/B markers per route.
  routeLayers.retain(ids);
  markers.retain(ids);
  for (const route of state.routes) {
    const color = routeColor(route);
    routeLayers.set(route.id, route.status === 'ready' ? (route.result?.geometry ?? null) : null, color);
    markers.update(route.id, route.from, route.to, color, route.stops.flatMap((s) => (s.place ? [s.place] : [])));
  }
  applyHighlight(state);

  const totals = summarizeTrips(evaluations);
  sheetPeek.textContent =
    totals.includedCount === 0
      ? 'Dodaj trasę, aby policzyć koszt'
      : [
          totals.cost !== null ? `Łącznie ${formatCurrency(totals.cost)}` : 'Podaj cenę paliwa',
          formatKm(totals.totalKm),
        ].join(' · ');

  tripsSummary.update({
    items: state.routes.map((route, i) => ({
      id: route.id,
      name: routeName(route),
      color: routeColor(route),
      evaluation: evaluations[i]!,
    })),
    totals,
    people: state.people,
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

// ---------- Persistence ----------

let saveWarningShown = false;

function persist(): void {
  if (!storage) return;
  const result = saveState(storage, store.get());
  if (result === 'failed' && !saveWarningShown) {
    saveWarningShown = true;
    toaster.show('Nie udało się zapisać danych w przeglądarce – po odświeżeniu mogą zniknąć.');
  }
}

const saveNow = debounce(persist, 300);
store.subscribe(() => saveNow());

// Flush pending changes when the tab is hidden or closed.
const flush = (): void => {
  saveNow.cancel();
  persist();
};
window.addEventListener('pagehide', flush);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') flush();
});

if (!storage) {
  toaster.show('Ta przeglądarka nie pozwala zapisać danych – po odświeżeniu trasy znikną.', undefined, 8000);
}

// Restored session: show all saved routes equally (nothing dimmed) and recalculate
// the ones saved without a result.
if (restored) {
  if (restored.routes.length > 1) store.update((s) => setActiveRoute(s, null));
  for (const route of restored.routes) {
    if (route.from && route.to && route.status !== 'ready') void requestRoute(route.id);
  }
  if (!routeLayers.fit()) {
    const withPlaces = restored.routes.find((r) => r.from || r.to);
    if (withPlaces) markers.frame(withPlaces.id);
  }
}

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
