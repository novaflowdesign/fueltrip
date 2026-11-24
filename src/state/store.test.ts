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
  setPeople,
  Store,
  updateRoute,
  setPrice,
  addCar,
  updateCar,
  removeCar,
  resolveCar,
  fuelsInUse,
  CUSTOM_CAR,
  DEFAULT_CAR_ID,
  routePoints,
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
    expect(state.settings).toEqual({ prices: { pb95: '', on: '', lpg: '' } });
    expect(state.cars).toEqual([{ id: DEFAULT_CAR_ID, name: 'Moje auto', consumption: '7,5', fuelType: 'pb95' }]);
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

describe('setActiveRoute / setPrice', () => {
  it('returns the same object when nothing changes', () => {
    const state = createInitialState(ids());
    expect(setActiveRoute(state, 'r1')).toBe(state);
    expect(setActiveRoute(state, 'missing')).toBe(state);
    expect(setActiveRoute(state, null).activeRouteId).toBeNull();
  });

  it('sets the price of one fuel', () => {
    const state = setPrice(createInitialState(ids()), 'lpg', '3,19');
    expect(state.settings.prices).toEqual({ pb95: '', on: '', lpg: '3,19' });
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

describe('setPeople', () => {
  it('clamps to 1–20 and keeps identity when unchanged', () => {
    const state = createInitialState(ids());
    expect(state.people).toBe(1);
    expect(setPeople(state, 1)).toBe(state);
    expect(setPeople(state, 4).people).toBe(4);
    expect(setPeople(state, 0).people).toBe(1);
    expect(setPeople(state, 50).people).toBe(20);
  });
});

describe('car profiles', () => {
  it('adds, updates and removes cars; the default car stays', () => {
    const makeId = ids();
    let state = createInitialState(makeId);
    const added = addCar(state, makeId);
    state = updateCar(added.state, added.id, { name: 'Bus', consumption: '9,5', fuelType: 'on' });
    expect(state.cars.map((c) => c.name)).toEqual(['Moje auto', 'Bus']);

    expect(removeCar(state, DEFAULT_CAR_ID)).toBe(state);
    expect(removeCar(state, added.id).cars).toHaveLength(1);
  });

  it('new cars start from the default car values', () => {
    const makeId = ids();
    let state = updateCar(createInitialState(makeId), DEFAULT_CAR_ID, { consumption: '6,1', fuelType: 'lpg' });
    const { state: next, id } = addCar(state, makeId);
    expect(next.cars.find((c) => c.id === id)).toMatchObject({ name: 'Auto 2', consumption: '6,1', fuelType: 'lpg' });
    state = next;
  });

  it('routes using a removed car fall back to the default car', () => {
    const makeId = ids();
    const { state: withCar, id } = addCar(createInitialState(makeId), makeId);
    const state = removeCar(updateRoute(withCar, 'r1', { carId: id }), id);
    expect(state.routes[0]!.carId).toBeNull();
  });

  it('resolves the consumption and fuel a route uses', () => {
    const makeId = ids();
    const { state: s1, id } = addCar(createInitialState(makeId), makeId);
    const state = updateCar(s1, id, { consumption: '9,5', fuelType: 'on' });
    const route = state.routes[0]!;

    expect(resolveCar(state, route)).toMatchObject({ consumption: '7,5', fuelType: 'pb95', car: { id: DEFAULT_CAR_ID } });
    expect(resolveCar(state, { ...route, carId: id })).toMatchObject({ consumption: '9,5', fuelType: 'on' });
    expect(resolveCar(state, { ...route, carId: CUSTOM_CAR, consumption: '5' })).toEqual({ car: null, consumption: '5', fuelType: 'pb95' });
    expect(resolveCar(state, { ...route, carId: 'deleted' })).toMatchObject({ car: { id: DEFAULT_CAR_ID } });
  });

  it('needs prices only for fuels actually in use', () => {
    const makeId = ids();
    let state = addRoute(createInitialState(makeId), makeId);
    expect(fuelsInUse(state)).toEqual(['pb95']);

    const added = addCar(state, makeId);
    state = updateCar(added.state, added.id, { fuelType: 'lpg' });
    expect(fuelsInUse(state)).toEqual(['pb95']); // car exists but no route uses it

    state = updateRoute(state, 'r2', { carId: added.id });
    expect(fuelsInUse(state)).toEqual(['pb95', 'lpg']);
  });
});

describe('routePoints', () => {
  const p = (id: string) => ({ id, name: id, context: '', label: id, lon: 19, lat: 50 });

  it('is null until start and end are chosen', () => {
    expect(routePoints({ from: p('A'), to: null, stops: [] })).toBeNull();
    expect(routePoints({ from: null, to: p('B'), stops: [] })).toBeNull();
  });

  it('routes through filled stops in order and skips empty ones', () => {
    const points = routePoints({
      from: p('A'),
      to: p('B'),
      stops: [{ id: 's1', place: p('S1') }, { id: 's2', place: null }, { id: 's3', place: p('S3') }],
    });
    expect(points?.map((x) => x.id)).toEqual(['A', 'S1', 'S3', 'B']);
  });
});
