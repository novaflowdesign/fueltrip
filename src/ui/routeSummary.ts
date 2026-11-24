import { tripDistance } from '../calc.ts';
import type { RouteResult } from '../services/routing.ts';
import { formatDuration, formatKm } from '../utils/format.ts';

export interface RouteSummaryOptions {
  /** Unique prefix for element ids. */
  idPrefix: string;
  roundTrip: boolean;
  onRoundTripChange: (roundTrip: boolean) => void;
}

export interface RouteSummary {
  element: HTMLElement;
  /** Nothing to show yet – a short hint instead. */
  showIdle(text: string): void;
  showLoading(): void;
  showRoute(route: RouteResult): void;
  /** Non-error notice (e.g. start = end). */
  showMessage(text: string): void;
  showError(text: string, onRetry: () => void): void;
}

/** Route stats block: distance, driving time and the round-trip toggle. */
export function createRouteSummary(opts: RouteSummaryOptions): RouteSummary {
  const element = document.createElement('section');
  element.className = 'route-summary';
  element.setAttribute('aria-label', 'Podsumowanie trasy');

  // Live region only for the numbers, so toggling the checkbox doesn't re-announce everything.
  const stats = div('route-summary__stats');
  stats.setAttribute('aria-live', 'polite');
  const formula = paragraph('route-summary__formula', '');

  // The checkbox element is created once and kept across re-renders so it never loses focus.
  const roundTripInput = document.createElement('input');
  roundTripInput.type = 'checkbox';
  roundTripInput.id = `${opts.idPrefix}-round-trip`;
  roundTripInput.checked = opts.roundTrip;
  roundTripInput.className = 'switch__input';
  const roundTripLabel = document.createElement('label');
  roundTripLabel.className = 'switch';
  roundTripLabel.htmlFor = roundTripInput.id;
  const track = document.createElement('span');
  track.className = 'switch__track';
  track.setAttribute('aria-hidden', 'true');
  const text = document.createElement('span');
  text.textContent = 'Tam i z powrotem';
  roundTripLabel.append(roundTripInput, track, text);

  let route: RouteResult | null = null;

  roundTripInput.addEventListener('change', () => {
    renderStats();
    opts.onRoundTripChange(roundTripInput.checked);
  });

  function renderStats(): void {
    if (!route) return;
    const { oneWayKm, multiplier, totalKm } = tripDistance(route.distanceMeters / 1000, roundTripInput.checked);
    const roundTrip = multiplier === 2;

    stats.replaceChildren(
      stat(roundTrip ? 'Dystans łącznie' : 'Dystans', formatKm(totalKm)),
      stat(roundTrip ? 'Czas łącznie' : 'Czas przejazdu', `≈ ${formatDuration(roundToMinute(route.durationSeconds) * multiplier)}`),
    );
    formula.textContent = roundTrip ? `${formatKm(oneWayKm)} × 2 = ${formatKm(totalKm)}` : '';
    formula.hidden = !roundTrip;
  }

  const setState = (state: string, ...children: Node[]): void => {
    element.dataset.state = state;
    element.setAttribute('aria-busy', String(state === 'loading'));
    element.replaceChildren(...children);
  };

  return {
    element,

    showIdle(hint) {
      route = null;
      setState('idle', paragraph('route-summary__hint', hint));
    },

    showLoading() {
      route = null;
      const skeleton = div('route-summary__stats');
      skeleton.append(stat('Dystans', ''), stat('Czas przejazdu', ''));
      setState('loading', skeleton, paragraph('route-summary__hint', 'Wyznaczam trasę…'));
    },

    showRoute(newRoute) {
      route = newRoute;
      renderStats();
      setState('ready', stats, formula, roundTripLabel);
    },

    showMessage(message) {
      route = null;
      setState('message', paragraph('route-summary__hint', message));
    },

    showError(message, onRetry) {
      route = null;
      const retry = document.createElement('button');
      retry.type = 'button';
      retry.className = 'button button--secondary';
      retry.textContent = 'Spróbuj ponownie';
      retry.addEventListener('click', onRetry);

      const error = paragraph('route-summary__error', message);
      error.setAttribute('role', 'alert');
      setState('error', error, retry);
    },
  };
}

/** Round to the minute first so "1 h 23 min" doubled reads "2 h 46 min", not "2 h 45 min". */
function roundToMinute(seconds: number): number {
  return Math.round(seconds / 60) * 60;
}

function stat(label: string, value: string): HTMLElement {
  const wrap = div('stat');
  const labelEl = document.createElement('span');
  labelEl.className = 'stat__label';
  labelEl.textContent = label;
  const valueEl = document.createElement('span');
  valueEl.className = 'stat__value';
  valueEl.textContent = value;
  wrap.append(labelEl, valueEl);
  return wrap;
}

function paragraph(className: string, text: string): HTMLParagraphElement {
  const p = document.createElement('p');
  p.className = className;
  p.textContent = text;
  return p;
}

function div(className: string): HTMLDivElement {
  const d = document.createElement('div');
  d.className = className;
  return d;
}
