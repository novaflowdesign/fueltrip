import { describe, expect, it } from 'vitest';
import type { Place } from '../services/geocoding.ts';
import type { RouteResult } from '../services/routing.ts';
import { clearState, deserialize, loadState, saveState, STORAGE_KEY, type StorageLike } from './persistence.ts';
import { addCar, addRoute, createInitialState, CUSTOM_CAR, DEFAULT_CAR_ID, setPrice, updateCar, updateRoute, type AppState, type IdFactory } from './store.ts';

function ids(): IdFactory {
  let n = 0;
  return () => `id${++n}`;
}

class MemoryStorage implements StorageLike {
  data = new Map<string, string>();
  constructor(private readonly quota = Infinity) {}
  getItem(key: string): string | null {
    return this.data.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    if (value.length > this.quota) throw new DOMException('full', 'QuotaExceededError');
    this.data.set(key, value);
  }
  removeItem(key: string): void {
    this.data.delete(key);
  }
}

class BrokenStorage implements StorageLike {
  getItem(): string | null {
    throw new Error('SecurityError');
  }
  setItem(): void {
    throw new Error('SecurityError');
  }
  removeItem(): void {
    throw new Error('SecurityError');
  }
}

const gliwice: Place = { id: 'R1', name: 'Gliwice', context: 'Polska', label: 'Gliwice, Polska', lon: 18.67, lat: 50.29 };
const krakow: Place = { id: 'R2', name: 'Kraków', context: 'Polska', label: 'Kraków, Polska', lon: 19.94, lat: 50.06 };
const result: RouteResult = {
  distanceMeters: 108980,
  durationSeconds: 4547,
  geometry: {
    type: 'LineString',
    coordinates: Array.from({ length: 200 }, (_, i) => [18.67 + i * 0.006, 50.29 - i * 0.001]),
  },
};

function sampleState(): AppState {
  const makeId = ids();
  let state = createInitialState(makeId);
  state = updateRoute(state, 'id1', { name: 'Praca', from: gliwice, to: krakow, status: 'ready', result, roundTrip: true });
  state = addRoute(state, makeId);
  state = updateRoute(state, 'id2', { from: krakow, to: gliwice, status: 'loading', carId: CUSTOM_CAR, consumption: '5,5' });
  const added = addCar(state, () => 'car-bus');
  state = updateCar(added.state, 'car-bus', { name: 'Bus', consumption: '9,5', fuelType: 'on' });
  state = updateRoute(state, 'id1', { carId: 'car-bus' });
  return setPrice(setPrice(state, 'pb95', '6,29'), 'on', '6,59');
}

describe('save + load round trip', () => {
  it('restores routes, names, settings and finished route geometry', () => {
    const storage = new MemoryStorage();
    expect(saveState(storage, sampleState())).toBe('ok');

    const loaded = loadState(storage, ids())!;
    expect(loaded.routes).toHaveLength(2);
    expect(loaded.routes[0]).toMatchObject({
      id: 'id1',
      name: 'Praca',
      roundTrip: true,
      from: gliwice,
      to: krakow,
      status: 'ready',
      collapsed: true,
    });
    expect(loaded.routes[0]!.result).toEqual(result);
    expect(loaded.settings).toEqual({ prices: { pb95: '6,29', on: '6,59', lpg: '' } });
    expect(loaded.cars.map((c) => c.name)).toEqual(['Moje auto', 'Bus']);
    expect(loaded.routes[0]!.carId).toBe('car-bus');
    expect(loaded.activeRouteId).toBe('id2');
    expect(loaded.nextNumber).toBe(3);
  });

  it('does not keep in-flight results – such routes come back idle (to be recalculated)', () => {
    const storage = new MemoryStorage();
    saveState(storage, sampleState());
    const second = loadState(storage, ids())!.routes[1]!;
    expect(second).toMatchObject({ status: 'idle', result: null, carId: CUSTOM_CAR, consumption: '5,5', from: krakow, to: gliwice });
  });

  it('falls back to saving without geometry when the quota is exceeded', () => {
    const storage = new MemoryStorage(3000); // full save is ~8 kB, without geometry ~1.5 kB
    expect(saveState(storage, sampleState())).toBe('without-geometry');
    const loaded = loadState(storage, ids())!;
    expect(loaded.routes[0]).toMatchObject({ name: 'Praca', status: 'idle', result: null, from: gliwice });
  });

  it('reports failure when nothing can be saved', () => {
    expect(saveState(new MemoryStorage(10), sampleState())).toBe('failed');
    expect(saveState(new BrokenStorage(), sampleState())).toBe('failed');
  });
});

describe('robust loading', () => {
  it('returns null for missing, corrupted or foreign data', () => {
    expect(deserialize(null)).toBeNull();
    expect(deserialize('')).toBeNull();
    expect(deserialize('{not json')).toBeNull();
    expect(deserialize('[]')).toBeNull();
    expect(deserialize(JSON.stringify({ version: 2, routes: [] }))).toBeNull();
    expect(deserialize(JSON.stringify({ version: 1, routes: [] }))).toBeNull();
  });

  it('survives storage that throws on access', () => {
    expect(loadState(new BrokenStorage())).toBeNull();
    expect(() => clearState(new BrokenStorage())).not.toThrow();
  });

  it('sanitizes invalid fields instead of failing', () => {
    const raw = JSON.stringify({
      version: 1,
      routes: [
        {
          id: 'a',
          name: 42,
          number: -1,
          colorIndex: 'red',
          from: { ...gliwice, lat: 999 }, // invalid coordinates → dropped
          to: krakow,
          roundTrip: 'yes',
          consumption: null,
          result,
        },
        'garbage',
        { id: 'a', from: gliwice, to: krakow, result: { ...result, geometry: { type: 'Point' } } },
      ],
      settings: { consumption: 7.5, price: '6,29', fuelType: 'diesel' }, // legacy format, partly invalid
      nextNumber: 'x',
      activeRouteId: 'nope',
    });

    const state = deserialize(raw, ids())!;
    expect(state.routes).toHaveLength(2);

    const [first, second] = state.routes;
    expect(first).toMatchObject({ id: 'a', name: '', number: 1, colorIndex: 0, from: null, to: krakow, roundTrip: false, consumption: '' });
    // Result dropped because an endpoint is missing.
    expect(first!.result).toBeNull();

    // Duplicate id replaced, invalid geometry dropped.
    expect(second!.id).toBe('id1');
    expect(second).toMatchObject({ status: 'idle', result: null, number: 3 });

    // Invalid legacy consumption/fuel → default car values; the price goes to its fuel.
    expect(state.cars).toEqual([{ id: DEFAULT_CAR_ID, name: 'Moje auto', consumption: '7,5', fuelType: 'pb95' }]);
    expect(state.settings).toEqual({ prices: { pb95: '6,29', on: '', lpg: '' } });
    expect(state.nextNumber).toBe(4);
    expect(state.activeRouteId).toBeNull();
  });

  it('clearState removes the saved data', () => {
    const storage = new MemoryStorage();
    saveState(storage, sampleState());
    clearState(storage);
    expect(storage.getItem(STORAGE_KEY)).toBeNull();
  });
});

describe('times (repeat count)', () => {
  it('round-trips, clamps and defaults to 1 for older or invalid data', () => {
    const storage = new MemoryStorage();
    saveState(storage, updateRoute(sampleState(), 'id1', { times: 5 }));
    expect(loadState(storage, ids())!.routes.map((r) => r.times)).toEqual([5, 1]);

    const raw = JSON.parse(storage.getItem(STORAGE_KEY)!);
    delete raw.routes[0].times;
    raw.routes[1].times = 'often';
    expect(deserialize(JSON.stringify(raw), ids())!.routes.map((r) => r.times)).toEqual([1, 1]);

    raw.routes[0].times = 9999;
    raw.routes[1].times = 0;
    expect(deserialize(JSON.stringify(raw), ids())!.routes.map((r) => r.times)).toEqual([365, 1]);
  });
});

describe('people count', () => {
  it('round-trips and defaults to 1 for older or invalid data', () => {
    const storage = new MemoryStorage();
    saveState(storage, { ...sampleState(), people: 3 });
    expect(loadState(storage, ids())!.people).toBe(3);

    const raw = JSON.parse(storage.getItem(STORAGE_KEY)!);
    delete raw.people;
    expect(deserialize(JSON.stringify(raw), ids())!.people).toBe(1);
    expect(deserialize(JSON.stringify({ ...raw, people: 'many' }), ids())!.people).toBe(1);
    expect(deserialize(JSON.stringify({ ...raw, people: 99 }), ids())!.people).toBe(20);
  });
});

describe('migration from the pre-profiles format', () => {
  it('turns global settings into the default car and per-route overrides into custom consumption', () => {
    const legacy = {
      version: 1,
      routes: [
        { id: 'a', name: 'Praca', number: 1, colorIndex: 0, from: gliwice, to: krakow, roundTrip: true, consumption: '', collapsed: false, result },
        { id: 'b', name: '', number: 2, colorIndex: 1, from: krakow, to: gliwice, roundTrip: false, consumption: '5,5', collapsed: false, result: null },
      ],
      activeRouteId: 'a',
      settings: { consumption: '6,8', price: '3,19', fuelType: 'lpg' },
      nextNumber: 3,
    };
    const state = deserialize(JSON.stringify(legacy), ids())!;
    expect(state.cars).toEqual([{ id: DEFAULT_CAR_ID, name: 'Moje auto', consumption: '6,8', fuelType: 'lpg' }]);
    expect(state.settings.prices).toEqual({ pb95: '', on: '', lpg: '3,19' });
    expect(state.routes.map((r) => r.carId)).toEqual([null, CUSTOM_CAR]);
    expect(state.routes[1]!.consumption).toBe('5,5');
    expect(state.people).toBe(1);
  });

  it('drops a carId that points to a car that no longer exists', () => {
    const raw = JSON.stringify({ version: 1, routes: [{ id: 'a', carId: 'ghost' }], cars: [{ id: 'c1', name: 'X', consumption: '6', fuelType: 'on' }] });
    const state = deserialize(raw, ids())!;
    expect(state.routes[0]!.carId).toBeNull();
    expect(state.cars).toEqual([{ id: 'c1', name: 'X', consumption: '6', fuelType: 'on' }]);
  });
});

describe('stops', () => {
  it('round-trips stops and sanitizes invalid ones', () => {
    const storage = new MemoryStorage();
    const state = updateRoute(sampleState(), 'id1', {
      stops: [{ id: 's1', place: krakow }, { id: 's2', place: null }],
    });
    saveState(storage, state);
    expect(loadState(storage, ids())!.routes[0]!.stops).toEqual([{ id: 's1', place: krakow }, { id: 's2', place: null }]);

    const raw = JSON.stringify({
      version: 1,
      routes: [{ id: 'a', stops: [{ id: 'x', place: { ...gliwice, lon: 'bad' } }, { id: 'x' }, 'junk', ...Array.from({ length: 8 }, (_, i) => ({ id: `s${i}` }))] }],
    });
    const stops = deserialize(raw, ids())!.routes[0]!.stops;
    expect(stops[0]).toEqual({ id: 'x', place: null });
    expect(stops).toHaveLength(5); // duplicates/junk dropped, capped at MAX_STOPS
  });

  it('older saves without stops get an empty list', () => {
    const raw = JSON.stringify({ version: 1, routes: [{ id: 'a', from: gliwice, to: krakow }] });
    expect(deserialize(raw, ids())!.routes[0]!.stops).toEqual([]);
  });
});
