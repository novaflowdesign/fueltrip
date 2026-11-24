import type { Place } from '../services/geocoding.ts';
import { GeocodingError } from '../services/geocoding.ts';
import { debounce } from '../utils/debounce.ts';

const DEBOUNCE_MS = 300;
const MIN_CHARS = 3;

export interface AutocompleteOptions {
  /** Unique id prefix for the input / listbox elements. */
  id: string;
  label: string;
  placeholder: string;
  /** Extra class for the field (e.g. start/end styling). */
  className?: string;
  search: (query: string, signal: AbortSignal) => Promise<Place[]>;
  /** Called with the chosen place, or `null` when the selection is cleared. */
  onSelect: (place: Place | null) => void;
}

export interface AutocompleteState {
  text: string;
  place: Place | null;
}

/**
 * Accessible address combobox (WAI-ARIA combobox + listbox pattern).
 * Keyboard: ↑/↓ move, Enter selects, Esc closes.
 */
export class PlaceAutocomplete {
  readonly element: HTMLElement;

  private readonly input: HTMLInputElement;
  private readonly list: HTMLUListElement;
  private readonly status: HTMLElement;
  private readonly opts: AutocompleteOptions;

  private results: Place[] = [];
  private activeIndex = -1;
  private selected: Place | null = null;
  private controller: AbortController | null = null;
  private readonly debouncedSearch = debounce((q: string) => void this.runSearch(q), DEBOUNCE_MS);

  constructor(opts: AutocompleteOptions) {
    this.opts = opts;
    const inputId = `${opts.id}-input`;
    const listId = `${opts.id}-list`;
    const statusId = `${opts.id}-status`;

    this.element = el('div', `field ${opts.className ?? ''}`.trim());

    const label = el('label', 'field__label');
    label.htmlFor = inputId;
    label.textContent = opts.label;

    const box = el('div', 'combobox');

    this.input = el('input', 'combobox__input');
    Object.assign(this.input, {
      id: inputId,
      type: 'text',
      placeholder: opts.placeholder,
      autocomplete: 'off',
      spellcheck: false,
    });
    this.input.setAttribute('role', 'combobox');
    this.input.setAttribute('aria-autocomplete', 'list');
    this.input.setAttribute('aria-expanded', 'false');
    this.input.setAttribute('aria-controls', listId);
    this.input.setAttribute('aria-describedby', statusId);

    this.list = el('ul', 'combobox__list');
    this.list.id = listId;
    this.list.setAttribute('role', 'listbox');
    this.list.setAttribute('aria-label', opts.label);
    this.list.hidden = true;

    this.status = el('p', 'field__status');
    this.status.id = statusId;
    this.status.setAttribute('aria-live', 'polite');

    box.append(this.input, this.list);
    this.element.append(label, box, this.status);

    this.input.addEventListener('input', this.handleInput);
    this.input.addEventListener('keydown', this.handleKeydown);
    this.input.addEventListener('focus', this.handleFocus);
    this.input.addEventListener('blur', this.handleBlur);
    // Keep focus in the input while clicking an option (otherwise blur closes the list first).
    this.list.addEventListener('mousedown', (e) => e.preventDefault());
    this.list.addEventListener('click', this.handleListClick);
  }

  getState(): AutocompleteState {
    return { text: this.input.value, place: this.selected };
  }

  /** Set text + selection programmatically (no search, no onSelect callback). */
  setState(state: AutocompleteState): void {
    this.cancelPending();
    this.selected = state.place;
    this.input.value = state.place ? state.place.label : state.text;
    this.results = [];
    this.close();
    this.setStatus('');
    this.element.classList.toggle('is-selected', !!state.place);
  }

  focus(): void {
    this.input.focus();
  }

  // ---------- Event handlers ----------

  private readonly handleInput = (): void => {
    if (this.selected) {
      // Text no longer matches the chosen place → drop the selection.
      this.selected = null;
      this.element.classList.remove('is-selected');
      this.opts.onSelect(null);
    }

    const query = this.input.value.trim();
    this.cancelPending();

    if (query.length < MIN_CHARS) {
      this.results = [];
      this.close();
      this.setStatus(query.length > 0 ? `Wpisz co najmniej ${MIN_CHARS} znaki` : '');
      return;
    }

    this.debouncedSearch(query);
  };

  private readonly handleKeydown = (e: KeyboardEvent): void => {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        if (this.list.hidden) this.openIfResults();
        this.moveActive(1);
        break;
      case 'ArrowUp':
        e.preventDefault();
        if (this.list.hidden) this.openIfResults();
        this.moveActive(-1);
        break;
      case 'Enter': {
        const place = this.results[this.activeIndex];
        if (!this.list.hidden && place) {
          e.preventDefault();
          this.select(place);
        } else if (!this.list.hidden && this.results[0]) {
          // Enter without highlighting → take the top result, like Google Maps.
          e.preventDefault();
          this.select(this.results[0]);
        }
        break;
      }
      case 'Escape':
        if (!this.list.hidden) {
          e.preventDefault();
          this.close();
        }
        break;
      case 'Tab':
        this.close();
        break;
    }
  };

  private readonly handleFocus = (): void => {
    if (!this.selected) this.openIfResults();
  };

  private readonly handleBlur = (): void => {
    this.close();
  };

  private readonly handleListClick = (e: MouseEvent): void => {
    const option = (e.target as HTMLElement).closest<HTMLElement>('[role="option"]');
    if (!option) return;
    const place = this.results[Number(option.dataset.index)];
    if (place) this.select(place);
  };

  // ---------- Search ----------

  private async runSearch(query: string): Promise<void> {
    this.controller?.abort();
    const controller = new AbortController();
    this.controller = controller;

    this.element.classList.add('is-loading');
    this.setStatus('Szukam…');

    try {
      const places = await this.opts.search(query, controller.signal);
      if (controller.signal.aborted) return;

      this.results = places;
      this.renderList();

      if (places.length === 0) {
        this.close();
        this.setStatus(`Brak wyników dla „${query}”`);
      } else {
        this.setStatus('');
        if (document.activeElement === this.input) this.open();
      }
    } catch (err) {
      if (controller.signal.aborted) return;
      this.results = [];
      this.close();
      this.setStatus(errorMessage(err), true);
    } finally {
      if (this.controller === controller) {
        this.controller = null;
        this.element.classList.remove('is-loading');
      }
    }
  }

  private cancelPending(): void {
    this.debouncedSearch.cancel();
    this.controller?.abort();
    this.controller = null;
    this.element.classList.remove('is-loading');
  }

  private select(place: Place): void {
    this.selected = place;
    this.input.value = place.label;
    this.element.classList.add('is-selected');
    this.close();
    this.setStatus('');
    this.opts.onSelect(place);
  }

  // ---------- Rendering ----------

  private renderList(): void {
    this.activeIndex = -1;
    this.list.replaceChildren(
      ...this.results.map((place, index) => {
        const li = el('li', 'combobox__option');
        li.id = `${this.opts.id}-opt-${index}`;
        li.dataset.index = String(index);
        li.setAttribute('role', 'option');
        li.setAttribute('aria-selected', 'false');

        const name = el('span', 'combobox__name');
        name.textContent = place.name;
        li.append(name);

        if (place.context) {
          const ctx = el('span', 'combobox__context');
          ctx.textContent = place.context;
          li.append(ctx);
        }
        return li;
      }),
    );
  }

  private moveActive(delta: number): void {
    const count = this.results.length;
    if (count === 0 || this.list.hidden) return;
    const next = this.activeIndex < 0 && delta < 0 ? count - 1 : (this.activeIndex + delta + count) % count;
    this.setActive(next);
  }

  private setActive(index: number): void {
    const options = this.list.querySelectorAll<HTMLElement>('[role="option"]');
    options.forEach((opt, i) => opt.setAttribute('aria-selected', String(i === index)));
    this.activeIndex = index;

    const active = options[index];
    if (active) {
      this.input.setAttribute('aria-activedescendant', active.id);
      active.scrollIntoView({ block: 'nearest' });
    } else {
      this.input.removeAttribute('aria-activedescendant');
    }
  }

  private openIfResults(): void {
    if (this.results.length > 0) this.open();
  }

  private open(): void {
    this.list.hidden = false;
    this.input.setAttribute('aria-expanded', 'true');
  }

  private close(): void {
    this.list.hidden = true;
    this.input.setAttribute('aria-expanded', 'false');
    this.setActive(-1);
  }

  private setStatus(text: string, isError = false): void {
    this.status.textContent = text;
    this.status.classList.toggle('is-error', isError);
  }
}

function errorMessage(err: unknown): string {
  if (err instanceof GeocodingError && err.kind === 'timeout') {
    return 'Serwer podpowiedzi nie odpowiada. Spróbuj ponownie za chwilę.';
  }
  if (!navigator.onLine) return 'Brak połączenia z internetem.';
  return 'Nie udało się pobrać podpowiedzi. Spróbuj ponownie.';
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;
  return node;
}
