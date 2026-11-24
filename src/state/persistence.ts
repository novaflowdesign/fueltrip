/**
 * Save / restore the app state in localStorage (covered by `persistence.test.ts`).
 * Every read and write is guarded: private mode, blocked storage, a full quota or
 * corrupted data must never break the app – it just starts fresh.
 */
import type { Place } from '../services/geocoding.ts';
import type { RouteResult } from '../services/routing.ts';
import {
  DEFAULT_SETTINGS,
  FUEL_LABELS,
  defaultIdFactory,
  type AppState,
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
  roundTrip: boolean;
  consumption: string;
  collapsed: boolean;
  result: RouteResult | null;
}

interface StoredState {
  version: typeof VERSION;
  savedAt: string;
  routes: StoredRoute[];
  activeRouteId: string | null;
  settings: FuelSettingsState;
  nextNumber: number;
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
      roundTrip: r.roundTrip,
      consumption: r.consumption,
      collapsed: r.collapsed,
      // Only finished routes are worth keeping; loading/error ones are recalculated on start.
      result: withGeometry && r.status === 'ready' ? r.result : null,
    })),
    activeRouteId: state.activeRouteId,
    settings: state.settings,
    nextNumber: state.nextNumber,
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

  const seenIds = new Set<string>();
  const routes: TripRoute[] = [];
  data.routes.forEach((item: unknown, index: number) => {
    const route = parseRoute(item, index, makeId);
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

  return { routes, activeRouteId, settings: parseSettings(data.settings), nextNumber };
}

function parseRoute(item: unknown, index: number, makeId: IdFactory): TripRoute | null {
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
    roundTrip: item.roundTrip === true,
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

function parseSettings(value: unknown): FuelSettingsState {
  if (!isObject(value)) return { ...DEFAULT_SETTINGS };
  return {
    consumption: typeof value.consumption === 'string' ? value.consumption.slice(0, 20) : DEFAULT_SETTINGS.consumption,
    price: typeof value.price === 'string' ? value.price.slice(0, 20) : DEFAULT_SETTINGS.price,
    fuelType: isFuelType(value.fuelType) ? value.fuelType : DEFAULT_SETTINGS.fuelType,
  };
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
