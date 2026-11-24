import type { Place } from '../services/geocoding.ts';
import { PlaceAutocomplete } from './autocomplete.ts';

export interface RouteEndpoints {
  from: Place | null;
  to: Place | null;
}

export interface RouteSearchOptions {
  search: (query: string, signal: AbortSignal) => Promise<Place[]>;
  onChange: (endpoints: RouteEndpoints) => void;
}

export interface RouteSearch {
  element: HTMLElement;
  getEndpoints(): RouteEndpoints;
}

/** "Skąd" / "Dokąd" search box with a swap button (single route for now). */
export function createRouteSearch(opts: RouteSearchOptions): RouteSearch {
  const emit = (): void => opts.onChange(getEndpoints());

  const from = new PlaceAutocomplete({
    id: 'route-from',
    label: 'Skąd',
    placeholder: 'Miejsce startu, np. Gliwice',
    className: 'field--start',
    search: opts.search,
    onSelect: emit,
  });

  const to = new PlaceAutocomplete({
    id: 'route-to',
    label: 'Dokąd',
    placeholder: 'Cel podróży, np. Kraków',
    className: 'field--end',
    search: opts.search,
    onSelect: emit,
  });

  const swap = document.createElement('button');
  swap.type = 'button';
  swap.className = 'route-search__swap';
  swap.setAttribute('aria-label', 'Zamień miejscami skąd i dokąd');
  swap.title = 'Zamień miejscami';
  swap.innerHTML =
    '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M7 4v13m0 0-3-3m3 3 3-3M17 20V7m0 0-3 3m3-3 3 3" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  swap.addEventListener('click', () => {
    const a = from.getState();
    const b = to.getState();
    from.setState(b);
    to.setState(a);
    emit();
  });

  const fields = document.createElement('div');
  fields.className = 'route-search__fields';
  fields.append(from.element, to.element);

  const element = document.createElement('section');
  element.className = 'route-search';
  element.setAttribute('aria-label', 'Wyszukiwanie trasy');
  element.append(fields, swap);

  function getEndpoints(): RouteEndpoints {
    return { from: from.getState().place, to: to.getState().place };
  }

  return { element, getEndpoints };
}
