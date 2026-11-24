import type { RouteResult } from '../services/routing.ts';
import { formatDistance, formatDuration } from '../utils/format.ts';

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

/** Card under the search box with the route's distance and driving time. */
export function createRouteSummary(): RouteSummary {
  const element = document.createElement('section');
  element.className = 'route-summary';
  element.setAttribute('aria-live', 'polite');
  element.setAttribute('aria-label', 'Podsumowanie trasy');

  const setState = (state: string, ...children: Node[]): void => {
    element.dataset.state = state;
    element.setAttribute('aria-busy', String(state === 'loading'));
    element.replaceChildren(...children);
  };

  return {
    element,

    showIdle(text) {
      setState('idle', paragraph('route-summary__hint', text));
    },

    showLoading() {
      const stats = div('route-summary__stats');
      stats.append(stat('Dystans', ''), stat('Czas przejazdu', ''));
      setState('loading', stats, paragraph('route-summary__hint', 'Wyznaczam trasę…'));
    },

    showRoute(route) {
      const stats = div('route-summary__stats');
      stats.append(
        stat('Dystans', formatDistance(route.distanceMeters)),
        stat('Czas przejazdu', `≈ ${formatDuration(route.durationSeconds)}`),
      );
      setState('ready', stats);
    },

    showMessage(text) {
      setState('message', paragraph('route-summary__hint', text));
    },

    showError(text, onRetry) {
      const retry = document.createElement('button');
      retry.type = 'button';
      retry.className = 'button button--secondary';
      retry.textContent = 'Spróbuj ponownie';
      retry.addEventListener('click', onRetry);

      const error = paragraph('route-summary__error', text);
      error.setAttribute('role', 'alert');
      setState('error', error, retry);
    },
  };
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
