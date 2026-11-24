import { describe, expect, it } from 'vitest';
import {
  addRoute,
  createInitialState,
  removeRoute,
  restoreRoute,
  routeColor,
  routeName,
  ROUTE_COLORS,
  setActiveRoute,
  Store,
  updateRoute,
  updateSettings,
  type IdFactory,
} from './store.ts';

function ids(): IdFactory {
  let n = 0;
  return () => `r${++n}`;
}

describe('createInitialState', () => {
  it('starts with one empty, active, expanded route', () => {
    const state = createInitialState(ids());
    expect(state.routes).toHaveLength(1);
    expect(state.routes[0]).toMatchObject({ id: 'r1', number: 1, name: '', collapsed: false, status: 'idle' });
    expect(state.activeRouteId).toBe('r1');
    expect(state.settings).toEqual({ consumption: '7,5', price: '', fuelType: 'pb95' });
  });
});

describe('routeName / routeColor', () => {
  it('falls back to "Trasa N" for empty or blank names', () => {
    expect(routeName({ name: '', number: 3 })).toBe('Trasa 3');
    expect(routeName({ name: '   ', number: 2 })).toBe('Trasa 2');
    expect(routeName({ name: ' Ślub ', number: 2 })).toBe('Ślub');
  });

  it('cycles through the palette', () => {
    expect(routeColor({ colorIndex: 0 })).toBe(ROUTE_COLORS[0]);
    expect(routeColor({ colorIndex: ROUTE_COLORS.length + 1 })).toBe(ROUTE_COLORS[1]);
  });
});

describe('addRoute', () => {
  it('numbers routes sequentially, activates the new one and collapses the rest', () => {
    const makeId = ids();
    let state = createInitialState(makeId);
    state = addRoute(state, makeId);
    state = addRoute(state, makeId);

    expect(state.routes.map((r) => routeName(r))).toEqual(['Trasa 1', 'Trasa 2', 'Trasa 3']);
    expect(state.routes.map((r) => r.collapsed)).toEqual([true, true, false]);
    expect(state.activeRouteId).toBe('r3');
  });

  it('gives each route a distinct color, reusing freed slots', () => {
    const makeId = ids();
    let state = createInitialState(makeId);
    state = addRoute(state, makeId); // color 1
    state = addRoute(state, makeId); // color 2
    expect(state.routes.map((r) => r.colorIndex)).toEqual([0, 1, 2]);

    state = removeRoute(state, 'r2', makeId).state;
    state = addRoute(state, makeId);
    expect(state.routes.map((r) => r.colorIndex)).toEqual([0, 2, 1]);
  });

  it('does not reuse numbers after a removal', () => {
    const makeId = ids();
    let state = addRoute(createInitialState(makeId), makeId);
    state = removeRoute(state, 'r2', makeId).state;
    state = addRoute(state, makeId);
    expect(routeName(state.routes[1]!)).toBe('Trasa 3');
  });
});

describe('removeRoute / restoreRoute', () => {
  it('removes a route and can restore it at the same position', () => {
    const makeId = ids();
    let state = addRoute(addRoute(createInitialState(makeId), makeId), makeId);
    state = updateRoute(state, 'r2', { name: 'Ślub' });

    const { state: afterRemove, removed } = removeRoute(state, 'r2', makeId);
    expect(afterRemove.routes.map((r) => r.id)).toEqual(['r1', 'r3']);
    expect(removed?.index).toBe(1);

    const restored = restoreRoute(afterRemove, removed!);
    expect(restored.routes.map((r) => r.id)).toEqual(['r1', 'r2', 'r3']);
    expect(restored.routes[1]!.name).toBe('Ślub');
    expect(restored.activeRouteId).toBe('r2');
  });

  it('clears the active route when it is removed', () => {
    const makeId = ids();
    const state = addRoute(createInitialState(makeId), makeId);
    expect(removeRoute(state, 'r2', makeId).state.activeRouteId).toBeNull();
  });

  it('never leaves the list empty', () => {
    const makeId = ids();
    const { state } = removeRoute(createInitialState(makeId), 'r1', makeId);
    expect(state.routes).toHaveLength(1);
    expect(state.routes[0]).toMatchObject({ id: 'r2', number: 2 });
  });

  it('undoing removal of the last route drops the placeholder again', () => {
    const makeId = ids();
    const initial = updateRoute(createInitialState(makeId), 'r1', { name: 'Praca' });
    const { state, removed } = removeRoute(initial, 'r1', makeId);
    const restored = restoreRoute(state, removed!);
    expect(restored.routes.map((r) => r.id)).toEqual(['r1']);
  });

  it('ignores unknown ids', () => {
    const state = createInitialState(ids());
    expect(removeRoute(state, 'nope').removed).toBeNull();
    expect(updateRoute(state, 'nope', { name: 'x' })).toBe(state);
  });
});

describe('setActiveRoute / updateSettings', () => {
  it('returns the same object when nothing changes', () => {
    const state = createInitialState(ids());
    expect(setActiveRoute(state, 'r1')).toBe(state);
    expect(setActiveRoute(state, 'missing')).toBe(state);
    expect(setActiveRoute(state, null).activeRouteId).toBeNull();
  });

  it('merges settings', () => {
    const state = updateSettings(createInitialState(ids()), { price: '6,29' });
    expect(state.settings).toEqual({ consumption: '7,5', price: '6,29', fuelType: 'pb95' });
  });
});

describe('Store', () => {
  it('notifies listeners only on real changes', () => {
    const store = new Store(createInitialState(ids()));
    const calls: number[] = [];
    store.subscribe((next) => calls.push(next.routes.length));

    store.update((s) => setActiveRoute(s, 'r1')); // no-op
    store.update((s) => addRoute(s));
    expect(calls).toEqual([2]);
  });
});
