import { validateConsumption, type TripEvaluation } from '../calc.ts';
import type { Place } from '../services/geocoding.ts';
import { routeColor, routeName, type TripRoute } from '../state/store.ts';
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
  onToggleCollapse: (id: string) => void;
  onRemove: (id: string) => void;
  /** `fit` = also move the map to the route. */
  onActivate: (id: string, fit: boolean) => void;
  onHover: (id: string | null) => void;
  onRetry: (id: string) => void;
}

export interface RouteCardContext {
  active: boolean;
  /** Global consumption as typed – shown as the placeholder of the override field. */
  globalConsumption: string;
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
      initial: { from: route.from, to: route.to },
      search: cb.search,
      onChange: (endpoints) => cb.onEndpointsChange(this.id, endpoints),
    });

    this.summary = createRouteSummary({
      idPrefix: prefix,
      roundTrip: route.roundTrip,
      onRoundTripChange: (value) => cb.onRoundTripChange(this.id, value),
    });

    this.consumption = createNumberField({
      id: `${prefix}-consumption`,
      label: 'Spalanie dla tej trasy',
      unit: 'l/100 km',
      placeholder: '',
      value: route.consumption,
      validate: validateConsumption,
      onInput: (value) => cb.onConsumptionChange(this.id, value),
    });
    this.consumption.element.classList.add('route-card__consumption');

    this.cost = document.createElement('div');
    this.cost.className = 'route-card__cost';
    this.cost.setAttribute('aria-live', 'polite');

    this.body.append(this.search.element, this.summary.element, this.consumption.element, this.cost);

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

    this.consumption.input.placeholder = ctx.globalConsumption.trim()
      ? `domyślnie ${ctx.globalConsumption.trim()}`
      : 'np. 7,5';

    this.renderStatus(route);
    this.renderCost(evaluation);
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

  private renderCost(e: TripEvaluation): void {
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
      liters.textContent = formatLiters(e.liters);
      value.append(' ', liters);
      this.cost.dataset.state = 'ready';
    } else {
      this.cost.dataset.state = 'hint';
      value.textContent =
        e.consumption.status !== 'ok'
          ? e.consumptionSource === 'route'
            ? 'Popraw spalanie powyżej'
            : 'Uzupełnij spalanie w sekcji „Paliwo”'
          : 'Podaj cenę w sekcji „Paliwo”';
    }

    this.cost.replaceChildren(label, value);
  }
}

function compactLine(route: TripRoute, e: TripEvaluation): string {
  if (!route.from && !route.to) return 'Trasa nieuzupełniona – kliknij, aby edytować';
  const parts = [`${route.from?.name ?? '…'} → ${route.to?.name ?? '…'}`];
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
