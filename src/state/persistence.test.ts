import { describe, expect, it } from 'vitest';
import type { Place } from '../services/geocoding.ts';
import type { RouteResult } from '../services/routing.ts';
import { clearState, deserialize, loadState, saveState, STORAGE_KEY, type StorageLike } from './persistence.ts';
import { addRoute, createInitialState, updateRoute, updateSettings, type AppState, type IdFactory } from './store.ts';

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
  state = updateRoute(state, 'id2', { from: krakow, to: gliwice, status: 'loading', consumption: '5,5' });
  return updateSettings(state, { price: '6,29', fuelType: 'lpg' });
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
    expect(loaded.settings).toEqual({ consumption: '7,5', price: '6,29', fuelType: 'lpg' });
    expect(loaded.activeRouteId).toBe('id2');
    expect(loaded.nextNumber).toBe(3);
  });

  it('does not keep in-flight results – such routes come back idle (to be recalculated)', () => {
    const storage = new MemoryStorage();
    saveState(storage, sampleState());
    const second = loadState(storage, ids())!.routes[1]!;
    expect(second).toMatchObject({ status: 'idle', result: null, consumption: '5,5', from: krakow, to: gliwice });
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
      settings: { consumption: 7.5, price: '6,29', fuelType: 'diesel' },
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

    expect(state.settings).toEqual({ consumption: '7,5', price: '6,29', fuelType: 'pb95' });
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
