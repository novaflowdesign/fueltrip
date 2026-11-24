import type { Place } from '../services/geocoding.ts';
import { PlaceAutocomplete } from './autocomplete.ts';

export interface RouteEndpoints {
  from: Place | null;
  to: Place | null;
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

/** "Skąd" / "Dokąd" fields with a swap button between them. */
export function createRouteSearch(opts: RouteSearchOptions): RouteSearch {
  const emit = (): void => opts.onChange(getEndpoints());

  const from = new PlaceAutocomplete({
    id: `${opts.idPrefix}-from`,
    label: 'Skąd',
    placeholder: 'Miejsce startu, np. Gliwice',
    className: 'field--start',
    search: opts.search,
    onSelect: emit,
  });

  const to = new PlaceAutocomplete({
    id: `${opts.idPrefix}-to`,
    label: 'Dokąd',
    placeholder: 'Cel podróży, np. Kraków',
    className: 'field--end',
    search: opts.search,
    onSelect: emit,
  });

  from.setState({ text: '', place: opts.initial.from });
  to.setState({ text: '', place: opts.initial.to });

  const swap = document.createElement('button');
  swap.type = 'button';
  swap.className = 'route-search__swap';
  swap.setAttribute('aria-label', 'Zamień miejscami skąd i dokąd');
  swap.title = 'Zamień miejscami';
  swap.innerHTML =
    '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M7 4v13m0 0-3-3m3 3 3-3M17 20V7m0 0-3 3m3-3 3 3" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  swap.addEventListener('click', () => {
    const a = from.getState();
    const b = to.getState();
    from.setState(b);
    to.setState(a);
    emit();
  });

  // The swap button sits between the two inputs, on the "Dokąd" label row,
  // so both inputs can use the full width.
  to.header.append(swap);

  const element = document.createElement('div');
  element.className = 'route-search';
  element.append(from.element, to.element);

  function getEndpoints(): RouteEndpoints {
    return { from: from.getState().place, to: to.getState().place };
  }

  return { element, getEndpoints, focusFrom: () => from.focus() };
}
