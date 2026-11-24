/**
 * Save / restore the app state in localStorage (covered by `persistence.test.ts`).
 * Every read and write is guarded: private mode, blocked storage, a full quota or
 * corrupted data must never break the app – it just starts fresh.
 */
import type { Place } from '../services/geocoding.ts';
import type { RouteResult } from '../services/routing.ts';
import {
  CUSTOM_CAR,
  DEFAULT_CAR,
  FUEL_LABELS,
  MAX_STOPS,
  defaultIdFactory,
  type AppState,
  type CarProfile,
  type FuelSettingsState,
  type FuelType,
  type IdFactory,
  type TripRoute,
} from './store.ts';

export const STORAGE_KEY = 'fueltrip:v1';
const VERSION = 1;

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

interface StoredRoute {
  id: string;
  name: string;
  number: number;
  colorIndex: number;
  from: Place | null;
  to: Place | null;
  stops: Array<{ id: string; place: Place | null }>;
  roundTrip: boolean;
  carId: string | null;
  consumption: string;
  collapsed: boolean;
  result: RouteResult | null;
}

interface StoredState {
  version: typeof VERSION;
  savedAt: string;
  routes: StoredRoute[];
  activeRouteId: string | null;
  cars: CarProfile[];
  settings: FuelSettingsState;
  nextNumber: number;
  people?: number;
}

/** localStorage if it is usable (a test write succeeds), otherwise null. */
export function getStorage(): StorageLike | null {
  try {
    const storage = globalThis.localStorage;
    if (!storage) return null;
    const probe = `${STORAGE_KEY}:probe`;
    storage.setItem(probe, '1');
    storage.removeItem(probe);
    return storage;
  } catch {
    return null;
  }
}

// ---------- Save ----------

export type SaveResult = 'ok' | 'without-geometry' | 'failed';

export function serialize(state: AppState, withGeometry: boolean): StoredState {
  return {
    version: VERSION,
    savedAt: new Date().toISOString(),
    routes: state.routes.map((r) => ({
      id: r.id,
      name: r.name,
      number: r.number,
      colorIndex: r.colorIndex,
      from: r.from,
      to: r.to,
      stops: r.stops,
      roundTrip: r.roundTrip,
      carId: r.carId,
      consumption: r.consumption,
      collapsed: r.collapsed,
      // Only finished routes are worth keeping; loading/error ones are recalculated on start.
      result: withGeometry && r.status === 'ready' ? r.result : null,
    })),
    activeRouteId: state.activeRouteId,
    cars: state.cars,
    settings: state.settings,
    nextNumber: state.nextNumber,
    people: state.people,
  };
}

/**
 * Save the state. If the quota is exceeded, retry without route geometry
 * (routes are then recalculated on the next start).
 */
export function saveState(storage: StorageLike, state: AppState): SaveResult {
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(serialize(state, true)));
    return 'ok';
  } catch {
    try {
      storage.setItem(STORAGE_KEY, JSON.stringify(serialize(state, false)));
      return 'without-geometry';
    } catch {
      return 'failed';
    }
  }
}

export function clearState(storage: StorageLike): void {
  try {
    storage.removeItem(STORAGE_KEY);
  } catch {
    // Nothing we can do – the app state is reset in memory anyway.
  }
}

// ---------- Load ----------

export function loadState(storage: StorageLike, makeId: IdFactory = defaultIdFactory): AppState | null {
  let raw: string | null;
  try {
    raw = storage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
  return deserialize(raw, makeId);
}

/** Parse and validate stored data. Returns null if there is nothing usable. */
export function deserialize(raw: string | null, makeId: IdFactory = defaultIdFactory): AppState | null {
  if (!raw) return null;

  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isObject(data) || data.version !== VERSION || !Array.isArray(data.routes)) return null;

  // Older saves (before car profiles) had one global consumption/fuel/price in `settings`.
  const legacy = isObject(data.settings) ? data.settings : {};
  const cars = parseCars(data.cars, legacy);
  const carIds = new Set(cars.map((c) => c.id));

  const seenIds = new Set<string>();
  const routes: TripRoute[] = [];
  data.routes.forEach((item: unknown, index: number) => {
    const route = parseRoute(item, index, makeId, carIds);
    if (!route) return;
    if (seenIds.has(route.id)) route.id = makeId();
    seenIds.add(route.id);
    routes.push(route);
  });
  if (routes.length === 0) return null;

  const maxNumber = Math.max(...routes.map((r) => r.number));
  const nextNumber = isPositiveInt(data.nextNumber) ? Math.max(data.nextNumber, maxNumber + 1) : maxNumber + 1;

  const activeRouteId =
    typeof data.activeRouteId === 'string' && routes.some((r) => r.id === data.activeRouteId)
      ? data.activeRouteId
      : routes.length === 1
        ? routes[0]!.id
        : null;

  const people = Number.isInteger(data.people) ? Math.min(20, Math.max(1, data.people as number)) : 1;

  return { routes, activeRouteId, cars, settings: parseSettings(data.settings, cars[0]!.fuelType), nextNumber, people };
}

function parseRoute(item: unknown, index: number, makeId: IdFactory, carIds: Set<string>): TripRoute | null {
  if (!isObject(item)) return null;

  const from = parsePlace(item.from);
  const to = parsePlace(item.to);
  const result = from && to ? parseResult(item.result) : null;

  return {
    id: typeof item.id === 'string' && item.id.length > 0 && item.id.length <= 100 ? item.id : makeId(),
    name: typeof item.name === 'string' ? item.name.slice(0, 60) : '',
    number: isPositiveInt(item.number) ? item.number : index + 1,
    colorIndex: Number.isInteger(item.colorIndex) && (item.colorIndex as number) >= 0 ? (item.colorIndex as number) : index,
    from,
    to,
    stops: parseStops(item.stops),
    roundTrip: item.roundTrip === true,
    carId: parseCarId(item, carIds),
    consumption: typeof item.consumption === 'string' ? item.consumption.slice(0, 20) : '',
    collapsed: item.collapsed === true,
    // Routes without a stored result but with both endpoints are recalculated on start.
    status: result ? 'ready' : 'idle',
    result,
    error: null,
  };
}

function parsePlace(value: unknown): Place | null {
  if (!isObject(value)) return null;
  const { id, name, context, label, lon, lat } = value;
  if (typeof id !== 'string' || typeof name !== 'string' || typeof label !== 'string') return null;
  if (!isFiniteNumber(lon) || !isFiniteNumber(lat) || Math.abs(lon) > 180 || Math.abs(lat) > 90) return null;
  return { id, name, context: typeof context === 'string' ? context : '', label, lon, lat };
}

function parseResult(value: unknown): RouteResult | null {
  if (!isObject(value)) return null;
  const { distanceMeters, durationSeconds, geometry } = value;
  if (!isFiniteNumber(distanceMeters) || distanceMeters < 0) return null;
  if (!isFiniteNumber(durationSeconds) || durationSeconds < 0) return null;
  if (!isObject(geometry) || geometry.type !== 'LineString' || !Array.isArray(geometry.coordinates)) return null;

  const coords = geometry.coordinates as unknown[];
  if (coords.length < 2) return null;
  const valid = coords.every(
    (c) => Array.isArray(c) && c.length >= 2 && isFiniteNumber(c[0]) && isFiniteNumber(c[1]),
  );
  if (!valid) return null;

  return {
    distanceMeters,
    durationSeconds,
    geometry: { type: 'LineString', coordinates: coords as GeoJSON.Position[] },
  };
}

function parseStops(value: unknown): TripRoute['stops'] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  return value
    .filter((s): s is Record<string, unknown> => isObject(s) && typeof s.id === 'string' && !!s.id)
    .filter((s) => !seen.has(s.id as string) && !!seen.add(s.id as string))
    .slice(0, MAX_STOPS)
    .map((s) => ({ id: (s.id as string).slice(0, 100), place: parsePlace(s.place) }));
}

function parseCarId(item: Record<string, unknown>, carIds: Set<string>): string | null {
  if (item.carId === CUSTOM_CAR) return CUSTOM_CAR;
  if (typeof item.carId === 'string' && carIds.has(item.carId)) return item.carId;
  // Legacy: a per-route consumption override becomes a one-off custom consumption.
  if (!('carId' in item) && typeof item.consumption === 'string' && item.consumption.trim()) return CUSTOM_CAR;
  return null;
}

function parseCars(value: unknown, legacy: Record<string, unknown>): CarProfile[] {
  const seen = new Set<string>();
  const cars: CarProfile[] = [];
  if (Array.isArray(value)) {
    for (const item of value) {
      if (!isObject(item) || typeof item.id !== 'string' || !item.id || seen.has(item.id)) continue;
      seen.add(item.id);
      cars.push({
        id: item.id.slice(0, 100),
        name: typeof item.name === 'string' ? item.name.slice(0, 40) : 'Auto',
        consumption: typeof item.consumption === 'string' ? item.consumption.slice(0, 20) : DEFAULT_CAR.consumption,
        fuelType: isFuelType(item.fuelType) ? item.fuelType : DEFAULT_CAR.fuelType,
      });
    }
  }
  if (cars.length > 0) return cars;

  // No (valid) profiles → the default car, built from legacy global settings if present.
  return [
    {
      ...DEFAULT_CAR,
      consumption: typeof legacy.consumption === 'string' ? legacy.consumption.slice(0, 20) : DEFAULT_CAR.consumption,
      fuelType: isFuelType(legacy.fuelType) ? legacy.fuelType : DEFAULT_CAR.fuelType,
    },
  ];
}

function parseSettings(value: unknown, defaultFuel: FuelType): FuelSettingsState {
  const prices: Record<FuelType, string> = { pb95: '', on: '', lpg: '' };
  if (!isObject(value)) return { prices };

  if (isObject(value.prices)) {
    for (const fuel of Object.keys(prices) as FuelType[]) {
      const p = value.prices[fuel];
      if (typeof p === 'string') prices[fuel] = p.slice(0, 20);
    }
  } else if (typeof value.price === 'string') {
    // Legacy single price → the default car's fuel.
    prices[defaultFuel] = value.price.slice(0, 20);
  }
  return { prices };
}

function isFuelType(value: unknown): value is FuelType {
  return typeof value === 'string' && Object.hasOwn(FUEL_LABELS, value);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isPositiveInt(value: unknown): value is number {
  return Number.isInteger(value) && (value as number) > 0;
}
