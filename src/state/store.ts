/**
 * Application state + pure update functions (covered by `store.test.ts`).
 * The state is plain JSON-friendly data so it can be persisted later.
 */
import type { Place } from '../services/geocoding.ts';
import type { RouteResult } from '../services/routing.ts';

import type { Fuel } from '../calc.ts';

export type FuelType = Fuel;

export const FUEL_LABELS: Record<FuelType, string> = {
  pb95: 'Pb95',
  on: 'ON',
  lpg: 'LPG',
};

/** Distinct, map-friendly colors (no pure red/green – those read as start/end). */
export const ROUTE_COLORS = [
  '#2563eb', // blue
  '#ea580c', // orange
  '#9333ea', // purple
  '#0891b2', // cyan
  '#db2777', // pink
  '#ca8a04', // amber
  '#4338ca', // indigo
  '#475569', // slate
] as const;

export type RouteStatus = 'idle' | 'loading' | 'ready' | 'same-place' | 'error';

export interface TripRoute {
  id: string;
  /** User-given name; empty → default "Trasa N". */
  name: string;
  /** Sequential number used for the default name. */
  number: number;
  colorIndex: number;
  from: Place | null;
  to: Place | null;
  roundTrip: boolean;
  /** Car profile id; null = the default car; CUSTOM_CAR = one-off consumption below. */
  carId: string | null;
  /** Consumption typed for CUSTOM_CAR (raw input). */
  consumption: string;
  collapsed: boolean;
  status: RouteStatus;
  result: RouteResult | null;
  error: string | null;
}

export interface CarProfile {
  id: string;
  name: string;
  /** l/100 km as typed (validated in calc.ts). */
  consumption: string;
  fuelType: FuelType;
}

/** Route option meaning "one-off consumption typed in the route card". */
export const CUSTOM_CAR = 'custom';
export const DEFAULT_CAR_ID = 'car-default';

export interface FuelSettingsState {
  /** Price per liter as typed, per fuel type – only the ones in use need a value. */
  prices: Record<FuelType, string>;
}

export interface AppState {
  routes: TripRoute[];
  activeRouteId: string | null;
  /** cars[0] is the default car ("Moje auto") – it can't be removed. */
  cars: CarProfile[];
  settings: FuelSettingsState;
  nextNumber: number;
  /** Split the total cost between this many people (1–20). */
  people: number;
}

export const DEFAULT_SETTINGS: FuelSettingsState = { prices: { pb95: '', on: '', lpg: '' } };

export const DEFAULT_CAR: CarProfile = { id: DEFAULT_CAR_ID, name: 'Moje auto', consumption: '7,5', fuelType: 'pb95' };

export interface ResolvedCar {
  /** The profile used, or null for a one-off custom consumption. */
  car: CarProfile | null;
  consumption: string;
  fuelType: FuelType;
}

/** Which consumption and fuel a route uses (falls back to the default car). */
export function resolveCar(state: Pick<AppState, 'cars'>, route: Pick<TripRoute, 'carId' | 'consumption'>): ResolvedCar {
  const defaultCar = state.cars[0] ?? DEFAULT_CAR;
  if (route.carId === CUSTOM_CAR) {
    return { car: null, consumption: route.consumption, fuelType: defaultCar.fuelType };
  }
  const car = state.cars.find((c) => c.id === route.carId) ?? defaultCar;
  return { car, consumption: car.consumption, fuelType: car.fuelType };
}

/** Fuel types whose price is needed: those of the default car and of every route's car. */
export function fuelsInUse(state: Pick<AppState, 'cars' | 'routes'>): FuelType[] {
  const used = new Set<FuelType>([(state.cars[0] ?? DEFAULT_CAR).fuelType]);
  for (const route of state.routes) used.add(resolveCar(state, route).fuelType);
  return (Object.keys(FUEL_LABELS) as FuelType[]).filter((f) => used.has(f));
}

// ---------- Pure helpers ----------

export function routeName(route: Pick<TripRoute, 'name' | 'number'>): string {
  return route.name.trim() || `Trasa ${route.number}`;
}

export function routeColor(route: Pick<TripRoute, 'colorIndex'>): string {
  return ROUTE_COLORS[route.colorIndex % ROUTE_COLORS.length] ?? ROUTE_COLORS[0];
}

function newRoute(number: number, colorIndex: number, id: string): TripRoute {
  return {
    id,
    name: '',
    number,
    colorIndex,
    from: null,
    to: null,
    roundTrip: false,
    carId: null,
    consumption: '',
    collapsed: false,
    status: 'idle',
    result: null,
    error: null,
  };
}

/** First palette slot not used by an existing route (cycles when all are taken). */
function freeColorIndex(routes: TripRoute[], fallback: number): number {
  const used = new Set(routes.map((r) => r.colorIndex % ROUTE_COLORS.length));
  for (let i = 0; i < ROUTE_COLORS.length; i++) if (!used.has(i)) return i;
  return fallback % ROUTE_COLORS.length;
}

export type IdFactory = () => string;

let idCounter = 0;
export const defaultIdFactory: IdFactory = () =>
  globalThis.crypto?.randomUUID?.() ?? `route-${Date.now()}-${++idCounter}`;

export function createInitialState(makeId: IdFactory = defaultIdFactory): AppState {
  const first = newRoute(1, 0, makeId());
  return {
    routes: [first],
    activeRouteId: first.id,
    cars: [{ ...DEFAULT_CAR }],
    settings: { prices: { ...DEFAULT_SETTINGS.prices } },
    nextNumber: 2,
    people: 1,
  };
}

/** Append a new empty route, make it active and collapse the others to save space. */
export function addRoute(state: AppState, makeId: IdFactory = defaultIdFactory): AppState {
  const route = newRoute(state.nextNumber, freeColorIndex(state.routes, state.nextNumber - 1), makeId());
  return {
    ...state,
    routes: [...state.routes.map((r) => ({ ...r, collapsed: true })), route],
    activeRouteId: route.id,
    nextNumber: state.nextNumber + 1,
  };
}

export interface RemovedRoute {
  route: TripRoute;
  index: number;
}

/**
 * Remove a route. Returns what was removed so it can be restored (undo).
 * The list is never left empty – a fresh route replaces the last one.
 */
export function removeRoute(
  state: AppState,
  id: string,
  makeId: IdFactory = defaultIdFactory,
): { state: AppState; removed: RemovedRoute | null } {
  const index = state.routes.findIndex((r) => r.id === id);
  const route = state.routes[index];
  if (!route) return { state, removed: null };

  let routes = state.routes.filter((r) => r.id !== id);
  let nextNumber = state.nextNumber;
  if (routes.length === 0) {
    routes = [newRoute(nextNumber, freeColorIndex([], 0), makeId())];
    nextNumber++;
  }

  const activeRouteId = state.activeRouteId === id ? null : state.activeRouteId;
  return { state: { ...state, routes, activeRouteId, nextNumber }, removed: { route, index } };
}

/** Undo a removal: put the route back at its old position. */
export function restoreRoute(state: AppState, removed: RemovedRoute): AppState {
  if (state.routes.some((r) => r.id === removed.route.id)) return state;

  // If removal left a single untouched placeholder route, drop it again.
  const routes =
    state.routes.length === 1 && isPristine(state.routes[0]) ? [] : [...state.routes];
  routes.splice(Math.min(removed.index, routes.length), 0, removed.route);
  return { ...state, routes, activeRouteId: removed.route.id };
}

function isPristine(route: TripRoute | undefined): boolean {
  return !!route && !route.from && !route.to && !route.name.trim() && !route.consumption.trim();
}

export function updateRoute(state: AppState, id: string, patch: Partial<Omit<TripRoute, 'id'>>): AppState {
  if (!state.routes.some((r) => r.id === id)) return state;
  return { ...state, routes: state.routes.map((r) => (r.id === id ? { ...r, ...patch } : r)) };
}

export function setActiveRoute(state: AppState, id: string | null): AppState {
  if (state.activeRouteId === id) return state;
  if (id !== null && !state.routes.some((r) => r.id === id)) return state;
  return { ...state, activeRouteId: id };
}

export function setPeople(state: AppState, people: number): AppState {
  const n = Math.min(20, Math.max(1, Math.round(people)));
  return n === state.people ? state : { ...state, people: n };
}

export function setPrice(state: AppState, fuelType: FuelType, price: string): AppState {
  return { ...state, settings: { prices: { ...state.settings.prices, [fuelType]: price } } };
}

// ---------- Car profiles ----------

/** Add a car (copying the default car's values as a starting point). */
export function addCar(state: AppState, makeId: IdFactory = defaultIdFactory): { state: AppState; id: string } {
  const base = state.cars[0] ?? DEFAULT_CAR;
  const id = makeId();
  const car: CarProfile = { id, name: `Auto ${state.cars.length + 1}`, consumption: base.consumption, fuelType: base.fuelType };
  return { state: { ...state, cars: [...state.cars, car] }, id };
}

export function updateCar(state: AppState, id: string, patch: Partial<Omit<CarProfile, 'id'>>): AppState {
  if (!state.cars.some((c) => c.id === id)) return state;
  return { ...state, cars: state.cars.map((c) => (c.id === id ? { ...c, ...patch } : c)) };
}

/** Remove a car; routes that used it fall back to the default car. The default car stays. */
export function removeCar(state: AppState, id: string): AppState {
  if (state.cars[0]?.id === id || !state.cars.some((c) => c.id === id)) return state;
  return {
    ...state,
    cars: state.cars.filter((c) => c.id !== id),
    routes: state.routes.map((r) => (r.carId === id ? { ...r, carId: null } : r)),
  };
}

// ---------- Minimal observable store ----------

export type Listener = (state: AppState, prev: AppState) => void;

export class Store {
  private state: AppState;
  private readonly listeners = new Set<Listener>();

  constructor(initial: AppState) {
    this.state = initial;
  }

  get(): AppState {
    return this.state;
  }

  update(fn: (state: AppState) => AppState): void {
    const prev = this.state;
    const next = fn(prev);
    if (next === prev) return;
    this.state = next;
    for (const listener of this.listeners) listener(next, prev);
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}
