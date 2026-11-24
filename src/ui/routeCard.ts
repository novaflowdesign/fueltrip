import { validateConsumption, type TripEvaluation } from '../calc.ts';
import type { Place } from '../services/geocoding.ts';
import {
  CUSTOM_CAR,
  FUEL_LABELS,
  routeColor,
  routeName,
  type CarProfile,
  type ResolvedCar,
  type TripRoute,
} from '../state/store.ts';
import { formatCurrency, formatKm, formatLiters } from '../utils/format.ts';
import { animatedNumber } from './countUp.ts';
import { createNumberField, type NumberField } from './fuelSettings.ts';
import { createRouteSearch, type RouteEndpoints, type RouteSearch } from './routeSearch.ts';
import { createRouteSummary, type RouteSummary } from './routeSummary.ts';

export interface RouteCardCallbacks {
  search: (query: string, signal: AbortSignal) => Promise<Place[]>;
  onEndpointsChange: (id: string, endpoints: RouteEndpoints) => void;
  onRoundTripChange: (id: string, roundTrip: boolean) => void;
  onNameChange: (id: string, name: string) => void;
  onConsumptionChange: (id: string, value: string) => void;
  /** null = default car, CUSTOM_CAR = one-off consumption, otherwise a car id. */
  onCarChange: (id: string, carId: string | null) => void;
  onToggleCollapse: (id: string) => void;
  onRemove: (id: string) => void;
  /** `fit` = also move the map to the route. */
  onActivate: (id: string, fit: boolean) => void;
  onHover: (id: string | null) => void;
  onRetry: (id: string) => void;
}

export interface RouteCardContext {
  active: boolean;
  cars: CarProfile[];
  /** Car (or custom consumption) this route uses. */
  resolved: ResolvedCar;
}

const CHEVRON =
  '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="m6 9 6 6 6-6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const TRASH =
  '<svg viewBox="0 0 24 24" width="17" height="17" aria-hidden="true"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

/** One route in the list – persistent DOM, updated in place so inputs keep focus. */
export class RouteCard {
  readonly element: HTMLElement;

  private readonly id: string;
  private readonly cb: RouteCardCallbacks;
  private readonly nameInput: HTMLInputElement;
  private readonly collapseButton: HTMLButtonElement;
  private readonly removeButton: HTMLButtonElement;
  private readonly compact: HTMLButtonElement;
  private readonly body: HTMLElement;
  private readonly bodyWrap: HTMLElement;
  private animationTimer: ReturnType<typeof setTimeout> | undefined;
  private readonly search: RouteSearch;
  private readonly summary: RouteSummary;
  private readonly carSelect: HTMLSelectElement;
  private carOptionsKey = '';
  private readonly consumption: NumberField;
  private readonly cost: HTMLElement;
  private lastStatusKey: unknown[] = [];

  constructor(route: TripRoute, cb: RouteCardCallbacks) {
    this.id = route.id;
    this.cb = cb;
    const prefix = `route-${route.id}`;

    this.element = document.createElement('article');
    this.element.className = 'route-card';
    this.element.style.setProperty('--route-color', routeColor(route));

    // ----- header -----
    const header = document.createElement('header');
    header.className = 'route-card__header';

    const dot = document.createElement('span');
    dot.className = 'route-card__dot';
    dot.setAttribute('aria-hidden', 'true');

    this.nameInput = document.createElement('input');
    Object.assign(this.nameInput, {
      type: 'text',
      className: 'route-card__name',
      value: route.name,
      placeholder: routeName({ name: '', number: route.number }),
      maxLength: 60,
      spellcheck: false,
    });
    this.nameInput.setAttribute('aria-label', 'Nazwa trasy');
    this.nameInput.addEventListener('input', () => cb.onNameChange(this.id, this.nameInput.value));
    this.nameInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === 'Escape') this.nameInput.blur();
    });
    this.nameInput.addEventListener('blur', () => {
      const trimmed = this.nameInput.value.trim();
      if (trimmed !== this.nameInput.value) {
        this.nameInput.value = trimmed;
        cb.onNameChange(this.id, trimmed);
      }
    });

    this.collapseButton = iconButton('route-card__icon-btn route-card__collapse', CHEVRON);
    this.collapseButton.setAttribute('aria-controls', `${prefix}-body`);
    this.collapseButton.addEventListener('click', () => cb.onToggleCollapse(this.id));

    this.removeButton = iconButton('route-card__icon-btn route-card__remove', TRASH);
    this.removeButton.addEventListener('click', () => cb.onRemove(this.id));

    header.append(dot, this.nameInput, this.collapseButton, this.removeButton);

    // ----- collapsed one-liner -----
    this.compact = document.createElement('button');
    this.compact.type = 'button';
    this.compact.className = 'route-card__compact';
    this.compact.addEventListener('click', () => {
      cb.onToggleCollapse(this.id);
      cb.onActivate(this.id, true);
    });

    // ----- body -----
    this.body = document.createElement('div');
    this.body.className = 'route-card__body';
    this.body.id = `${prefix}-body`;

    this.search = createRouteSearch({
      idPrefix: prefix,
      initial: { from: route.from, to: route.to, stops: route.stops },
      search: cb.search,
      onChange: (endpoints) => cb.onEndpointsChange(this.id, endpoints),
    });

    this.summary = createRouteSummary({
      idPrefix: prefix,
      roundTrip: route.roundTrip,
      onRoundTripChange: (value) => cb.onRoundTripChange(this.id, value),
    });

    // Car choice: profiles from "Auta i paliwo" or a one-off consumption.
    const carField = document.createElement('div');
    carField.className = 'field route-card__car';
    const carLabel = document.createElement('label');
    carLabel.className = 'field__label';
    carLabel.htmlFor = `${prefix}-car`;
    carLabel.textContent = 'Auto';
    this.carSelect = document.createElement('select');
    this.carSelect.id = `${prefix}-car`;
    this.carSelect.className = 'select';
    this.carSelect.addEventListener('change', () => {
      const value = this.carSelect.value;
      const isDefault = this.carSelect.selectedIndex === 0;
      cb.onCarChange(this.id, value === CUSTOM_CAR ? CUSTOM_CAR : isDefault ? null : value);
      if (value === CUSTOM_CAR) queueMicrotask(() => this.consumption.input.focus());
    });
    carField.append(carLabel, this.carSelect);

    this.consumption = createNumberField({
      id: `${prefix}-consumption`,
      label: 'Własne spalanie',
      unit: 'l/100 km',
      placeholder: '',
      value: route.consumption,
      validate: validateConsumption,
      onInput: (value) => cb.onConsumptionChange(this.id, value),
    });
    this.consumption.element.classList.add('route-card__consumption');
    carField.append(this.consumption.element);

    this.cost = document.createElement('div');
    this.cost.className = 'route-card__cost';
    this.cost.setAttribute('aria-live', 'polite');

    this.body.append(this.search.element, this.summary.element, carField, this.cost);

    // Grid-rows trick (1fr ↔ 0fr) gives a smooth height animation for collapse/expand.
    this.bodyWrap = document.createElement('div');
    this.bodyWrap.className = 'route-card__body-wrap';
    this.bodyWrap.append(this.body);
    this.element.append(header, this.compact, this.bodyWrap);
    this.element.dataset.collapsed = String(route.collapsed);
    this.body.inert = route.collapsed;

    // ----- activation / highlight -----
    this.element.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      if (target.closest('button, input, label, a, [role="listbox"]')) return;
      cb.onActivate(this.id, true);
    });
    this.element.addEventListener('focusin', () => cb.onActivate(this.id, false));
    this.element.addEventListener('mouseenter', () => cb.onHover(this.id));
    this.element.addEventListener('mouseleave', () => cb.onHover(null));
  }

  update(route: TripRoute, evaluation: TripEvaluation, ctx: RouteCardContext): void {
    const name = routeName(route);
    this.element.dataset.active = String(ctx.active);
    if (this.element.dataset.collapsed !== String(route.collapsed)) this.animateCollapse(route.collapsed);

    if (document.activeElement !== this.nameInput && this.nameInput.value !== route.name) {
      this.nameInput.value = route.name;
    }

    this.collapseButton.setAttribute('aria-expanded', String(!route.collapsed));
    this.collapseButton.setAttribute('aria-label', `${route.collapsed ? 'Rozwiń' : 'Zwiń'} trasę ${name}`);
    this.collapseButton.title = route.collapsed ? 'Rozwiń' : 'Zwiń';
    this.removeButton.setAttribute('aria-label', `Usuń trasę ${name}`);
    this.removeButton.title = 'Usuń trasę';
    this.compact.hidden = !route.collapsed;
    this.compact.textContent = compactLine(route, evaluation);

    this.renderCarSelect(route, ctx);
    this.renderStatus(route);
    this.renderCost(evaluation, ctx.resolved);
  }

  /** While animating, clip the body; afterwards let dropdowns overflow the card again. */
  private animateCollapse(collapsed: boolean): void {
    clearTimeout(this.animationTimer);
    this.element.classList.add('is-animating');
    this.element.dataset.collapsed = String(collapsed);
    // Collapsed content must not be reachable with Tab or by screen readers.
    this.body.inert = collapsed;
    this.animationTimer = setTimeout(() => this.element.classList.remove('is-animating'), 320);
  }

  focusFrom(): void {
    this.search.focusFrom();
  }

  /** Only touch the stats block when the routing state really changed (keeps checkbox focus). */
  private renderStatus(route: TripRoute): void {
    const key = [route.status, route.result, route.error];
    if (key.every((v, i) => v === this.lastStatusKey[i])) return;
    this.lastStatusKey = key;

    switch (route.status) {
      case 'idle':
        this.summary.showIdle('Wybierz miejsce startu i cel podróży.');
        break;
      case 'loading':
        this.summary.showLoading();
        break;
      case 'same-place':
        this.summary.showMessage('Start i cel to to samo miejsce. Wybierz inny cel podróży.');
        break;
      case 'error':
        this.summary.showError(route.error ?? 'Nie udało się wyznaczyć trasy.', () => this.cb.onRetry(this.id));
        break;
      case 'ready':
        if (route.result) this.summary.showRoute(route.result);
        break;
    }
  }

  private renderCarSelect(route: TripRoute, ctx: RouteCardContext): void {
    // Rebuild options only when the car list (names/values) changed.
    const key = JSON.stringify(ctx.cars.map((c) => [c.id, c.name, c.consumption, c.fuelType]));
    if (key !== this.carOptionsKey) {
      this.carOptionsKey = key;
      const options = ctx.cars.map((car) => {
        const option = document.createElement('option');
        option.value = car.id;
        option.textContent = `${car.name || 'Auto'} · ${car.consumption.trim() || '?'} l/100 km · ${FUEL_LABELS[car.fuelType]}`;
        return option;
      });
      const custom = document.createElement('option');
      custom.value = CUSTOM_CAR;
      custom.textContent = 'Własne spalanie…';
      this.carSelect.replaceChildren(...options, custom);
    }
    const value = route.carId === CUSTOM_CAR ? CUSTOM_CAR : (ctx.resolved.car?.id ?? ctx.cars[0]?.id ?? '');
    if (this.carSelect.value !== value) this.carSelect.value = value;

    const custom = route.carId === CUSTOM_CAR;
    this.consumption.element.hidden = !custom;
    this.consumption.setValue(route.consumption);
    this.consumption.input.placeholder = `np. ${ctx.cars[0]?.consumption.trim() || '7,5'}`;
  }

  private renderCost(e: TripEvaluation, resolved: ResolvedCar): void {
    this.cost.hidden = !e.distance;
    if (!e.distance) return;

    const label = document.createElement('span');
    label.className = 'route-card__cost-label';
    label.textContent = 'Koszt tej trasy';

    const value = document.createElement('span');
    value.className = 'route-card__cost-value';

    if (e.cost !== null && e.liters !== null) {
      value.append(animatedNumber(`route-cost-${this.id}`, e.cost, formatCurrency));
      const liters = document.createElement('span');
      liters.className = 'route-card__cost-liters';
      liters.textContent = `${formatLiters(e.liters)} ${FUEL_LABELS[e.fuelType]}`;
      value.append(' ', liters);
      this.cost.dataset.state = 'ready';
    } else {
      this.cost.dataset.state = 'hint';
      value.textContent =
        e.consumption.status !== 'ok'
          ? resolved.car
            ? `Popraw spalanie auta „${resolved.car.name}”`
            : 'Podaj własne spalanie powyżej'
          : `Podaj cenę ${FUEL_LABELS[e.fuelType]} w sekcji „Auta i paliwo”`;
    }

    this.cost.replaceChildren(label, value);
  }
}

function compactLine(route: TripRoute, e: TripEvaluation): string {
  if (!route.from && !route.to) return 'Trasa nieuzupełniona – kliknij, aby edytować';
  const stops = route.stops.flatMap((s) => (s.place ? [s.place.name] : []));
  // Up to two stop names fit; more are summarized as a count.
  const middle =
    stops.length === 0 ? [] : stops.length <= 2 ? stops : [`${stops.length} ${stops.length < 5 ? 'przystanki' : 'przystanków'}`];
  const parts = [[route.from?.name ?? '…', ...middle, route.to?.name ?? '…'].join(' → ')];
  if (e.distance) parts.push(formatKm(e.distance.totalKm) + (route.roundTrip ? ' (×2)' : ''));
  if (e.cost !== null) parts.push(formatCurrency(e.cost));
  return parts.join(' · ');
}

function iconButton(className: string, svg: string): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = className;
  button.innerHTML = svg;
  return button;
}
