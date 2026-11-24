import { clampTimes, TIMES_RANGE, tripDistance } from '../calc.ts';
import type { RouteResult } from '../services/routing.ts';
import { formatDuration, formatKm } from '../utils/format.ts';
import { animatedNumber } from './countUp.ts';

export interface RouteSummaryOptions {
  /** Unique prefix for element ids. */
  idPrefix: string;
  roundTrip: boolean;
  onRoundTripChange: (roundTrip: boolean) => void;
  times: number;
  onTimesChange: (times: number) => void;
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
  /** Sync the repeat count from the state (skipped while the user is typing in it). */
  setTimes(times: number): void;
}

/** Route stats block: distance, driving time, the round-trip toggle and the repeat count. */
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
  let times = clampTimes(opts.times);

  roundTripInput.addEventListener('change', () => {
    renderStats();
    opts.onRoundTripChange(roundTripInput.checked);
  });

  const timesControl = createTimesStepper(`${opts.idPrefix}-times`, times, (value) => {
    if (value === times) return;
    times = value;
    renderStats();
    opts.onTimesChange(value);
  });

  const options = div('route-summary__options');
  options.append(roundTripLabel, timesControl.element);

  function renderStats(): void {
    if (!route) return;
    const { oneWayKm, multiplier, totalKm } = tripDistance(route.distanceMeters / 1000, roundTripInput.checked, times);
    const roundTrip = multiplier === 2;
    const repeated = times > 1;

    stats.replaceChildren(
      stat(roundTrip || repeated ? 'Dystans łącznie' : 'Dystans', animatedNumber(`${opts.idPrefix}-km`, totalKm, formatKm)),
      // Driving time is for one trip (there and back if checked) – summed over days it would mean little.
      stat(
        roundTrip ? (repeated ? 'Czas tam i z powrotem' : 'Czas łącznie') : 'Czas przejazdu',
        animatedNumber(
          `${opts.idPrefix}-min`,
          (roundToMinute(route.durationSeconds) / 60) * multiplier,
          (minutes) => `≈ ${formatDuration(Math.round(minutes) * 60)}`,
        ),
      ),
    );
    // e.g. "245,3 km × 2 × 3 = 1 471,8 km" (3 = number of times).
    const factors = [roundTrip ? '× 2' : '', repeated ? `× ${times} ${timesWord(times)}` : ''].filter(Boolean);
    formula.textContent = factors.length ? `${formatKm(oneWayKm)} ${factors.join(' ')} = ${formatKm(totalKm)}` : '';
    formula.hidden = factors.length === 0;
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
      setState('ready', stats, formula, options);
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

    setTimes(value) {
      const n = clampTimes(value);
      timesControl.setValue(n);
      if (n === times) return;
      times = n;
      renderStats();
    },
  };
}

/** Polish plural: 1 raz, 2+ razy. */
function timesWord(n: number): string {
  return n === 1 ? 'raz' : 'razy';
}

/**
 * "Ile razy: − N +" – how many times the trip is driven.
 * The number can also be typed (e.g. 20 working days); arrows ↑/↓ step by one.
 */
function createTimesStepper(
  id: string,
  initial: number,
  onChange: (times: number) => void,
): { element: HTMLElement; setValue: (times: number) => void } {
  const element = div('times');

  const label = document.createElement('label');
  label.className = 'times__label';
  label.htmlFor = id;
  label.textContent = 'Ile razy';

  const stepper = div('stepper stepper--small');
  const minus = document.createElement('button');
  const plus = document.createElement('button');
  for (const [button, symbol, aria] of [
    [minus, '−', 'Jeden raz mniej'],
    [plus, '+', 'Jeden raz więcej'],
  ] as const) {
    button.type = 'button';
    button.className = 'stepper__btn';
    button.textContent = symbol;
    button.setAttribute('aria-label', aria);
    button.setAttribute('aria-controls', id);
  }

  const input = document.createElement('input');
  Object.assign(input, {
    id,
    type: 'text',
    inputMode: 'numeric',
    autocomplete: 'off',
    spellcheck: false,
    maxLength: 3,
    className: 'stepper__input',
  });
  input.setAttribute('aria-label', 'Ile razy przejeżdżasz tę trasę');

  stepper.append(minus, input, plus);
  element.append(label, stepper);

  let current = initial;
  const render = (): void => {
    input.value = String(current);
    minus.disabled = current <= TIMES_RANGE.min;
    plus.disabled = current >= TIMES_RANGE.max;
  };
  const commit = (value: number): void => {
    current = clampTimes(value);
    render();
    onChange(current);
  };

  minus.addEventListener('click', () => commit(current - 1));
  plus.addEventListener('click', () => commit(current + 1));
  input.addEventListener('input', () => {
    // Keep digits only; apply valid numbers right away, empty is fixed on blur.
    const digits = input.value.replace(/\D/g, '');
    if (digits !== input.value) input.value = digits;
    const n = Number(digits);
    if (digits && n >= TIMES_RANGE.min) {
      current = clampTimes(n);
      minus.disabled = current <= TIMES_RANGE.min;
      plus.disabled = current >= TIMES_RANGE.max;
      onChange(current);
    }
  });
  input.addEventListener('blur', render);
  input.addEventListener('focus', () => input.select());
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault();
      commit(current + (e.key === 'ArrowUp' ? 1 : -1));
    } else if (e.key === 'Enter' || e.key === 'Escape') {
      input.blur();
    }
  });
  render();

  return {
    element,
    setValue(value) {
      if (value === current) return;
      current = value;
      if (document.activeElement !== input) render();
    },
  };
}

/** Round to the minute first so "1 h 23 min" doubled reads "2 h 46 min", not "2 h 45 min". */
function roundToMinute(seconds: number): number {
  return Math.round(seconds / 60) * 60;
}

function stat(label: string, value: string | Node): HTMLElement {
  const wrap = div('stat');
  const labelEl = document.createElement('span');
  labelEl.className = 'stat__label';
  labelEl.textContent = label;
  const valueEl = document.createElement('span');
  valueEl.className = 'stat__value';
  valueEl.append(value);
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
