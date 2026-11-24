import type { Place } from '../services/geocoding.ts';
import { MAX_STOPS, type RouteStop } from '../state/store.ts';
import { PlaceAutocomplete } from './autocomplete.ts';

export interface RouteEndpoints {
  from: Place | null;
  to: Place | null;
  stops: RouteStop[];
}

export interface RouteSearchOptions {
  /** Unique prefix so several searches can live on one page. */
  idPrefix: string;
  initial: RouteEndpoints;
  search: (query: string, signal: AbortSignal) => Promise<Place[]>;
  onChange: (endpoints: RouteEndpoints) => void;
}

export interface RouteSearch {
  element: HTMLElement;
  getEndpoints(): RouteEndpoints;
  focusFrom(): void;
}

interface StopRow {
  id: string;
  field: PlaceAutocomplete;
  element: HTMLElement;
  up: HTMLButtonElement;
  down: HTMLButtonElement;
  remove: HTMLButtonElement;
}

const ICON = {
  up: '<svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true"><path d="m6 15 6-6 6 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  down: '<svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true"><path d="m6 9 6 6 6-6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  remove:
    '<svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  swap: '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M7 4v13m0 0-3-3m3 3 3-3M17 20V7m0 0-3 3m3-3 3 3" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
};

let stopCounter = 0;
const newStopId = (): string => globalThis.crypto?.randomUUID?.() ?? `stop-${Date.now()}-${++stopCounter}`;

/** "Skąd" / optional stops / "Dokąd" with a swap button between the inputs. */
export function createRouteSearch(opts: RouteSearchOptions): RouteSearch {
  const emit = (): void => opts.onChange(getEndpoints());

  const from = new PlaceAutocomplete({
    id: `${opts.idPrefix}-from`,
    label: 'Skąd',
    badge: 'A',
    placeholder: 'Miejsce startu, np. Gliwice',
    className: 'field--start',
    search: opts.search,
    onSelect: emit,
  });

  const to = new PlaceAutocomplete({
    id: `${opts.idPrefix}-to`,
    label: 'Dokąd',
    badge: 'B',
    placeholder: 'Cel podróży, np. Kraków',
    className: 'field--end',
    search: opts.search,
    onSelect: emit,
  });

  from.setState({ text: '', place: opts.initial.from });
  to.setState({ text: '', place: opts.initial.to });

  // ----- stops -----
  const stopList = document.createElement('div');
  stopList.className = 'stop-list';
  let stops: StopRow[] = [];

  const addStop = document.createElement('button');
  addStop.type = 'button';
  addStop.className = 'route-search__add-stop';
  addStop.innerHTML = '<span aria-hidden="true">+</span> Dodaj przystanek';
  addStop.addEventListener('click', () => {
    const row = createStopRow({ id: newStopId(), place: null });
    stops.push(row);
    renderStops();
    row.field.focus();
    emit();
  });

  function createStopRow(stop: RouteStop): StopRow {
    const field = new PlaceAutocomplete({
      id: `${opts.idPrefix}-stop-${stop.id}`,
      label: 'Przystanek',
      badge: '1',
      placeholder: 'Miejsce po drodze',
      className: 'field--stop',
      search: opts.search,
      onSelect: emit,
    });
    field.setState({ text: '', place: stop.place });

    const controls = document.createElement('div');
    controls.className = 'stop-controls';
    const up = iconButton(ICON.up);
    const down = iconButton(ICON.down);
    const remove = iconButton(ICON.remove);
    remove.classList.add('stop-controls__remove');
    controls.append(up, down, remove);
    field.header.append(controls);

    const row: StopRow = { id: stop.id, field, element: field.element, up, down, remove };
    up.addEventListener('click', () => move(row, -1));
    down.addEventListener('click', () => move(row, 1));
    remove.addEventListener('click', () => {
      stops = stops.filter((s) => s !== row);
      renderStops();
      // Keep keyboard focus nearby after the row disappears.
      (stops[0]?.field ?? to).focus();
      emit();
    });
    return row;
  }

  function move(row: StopRow, delta: number): void {
    const index = stops.indexOf(row);
    const target = index + delta;
    if (target < 0 || target >= stops.length) return;
    stops.splice(index, 1);
    stops.splice(target, 0, row);
    renderStops();
    // Keep focus on the arrow that was used; at the end of the list it gets disabled.
    const button = delta < 0 ? row.up : row.down;
    if (button.disabled) row.field.focus();
    else button.focus();
    emit();
  }

  function renderStops(): void {
    stopList.replaceChildren(...stops.map((s) => s.element));
    stops.forEach((row, i) => {
      const n = i + 1;
      row.field.setLabel(`Przystanek ${n}`, String(n));
      row.up.disabled = i === 0;
      row.down.disabled = i === stops.length - 1;
      row.up.setAttribute('aria-label', `Przesuń przystanek ${n} wyżej`);
      row.down.setAttribute('aria-label', `Przesuń przystanek ${n} niżej`);
      row.remove.setAttribute('aria-label', `Usuń przystanek ${n}`);
    });
    addStop.hidden = stops.length >= MAX_STOPS;
  }

  stops = opts.initial.stops.map(createStopRow);
  renderStops();

  // ----- swap: reverse the whole route (end ↔ start, stops in reverse order) -----
  const swap = document.createElement('button');
  swap.type = 'button';
  swap.className = 'route-search__swap';
  swap.setAttribute('aria-label', 'Odwróć trasę (zamień skąd i dokąd)');
  swap.title = 'Odwróć trasę';
  swap.innerHTML = ICON.swap;
  swap.addEventListener('click', () => {
    const a = from.getState();
    const b = to.getState();
    from.setState(b);
    to.setState(a);
    stops.reverse();
    renderStops();
    emit();
  });

  // The swap button sits between the inputs, on the "Dokąd" label row,
  // so the inputs can use the full width.
  to.header.append(swap);

  const element = document.createElement('div');
  element.className = 'route-search';
  element.append(from.element, stopList, addStop, to.element);

  function getEndpoints(): RouteEndpoints {
    return {
      from: from.getState().place,
      to: to.getState().place,
      stops: stops.map((s) => ({ id: s.id, place: s.field.getState().place })),
    };
  }

  return { element, getEndpoints, focusFrom: () => from.focus() };
}

function iconButton(svg: string): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'stop-controls__btn';
  button.innerHTML = svg;
  return button;
}
