import { computeTripCost } from '../calc.ts';
import type { RouteResult } from '../services/routing.ts';
import { formatCurrency, formatKm, formatLiters, formatNumber } from '../utils/format.ts';
import { FUEL_LABELS, type FuelSettingsValue } from './fuelSettings.ts';

export interface CostInput {
  route: RouteResult | null;
  roundTrip: boolean;
  settings: FuelSettingsValue;
}

export interface CostSummary {
  element: HTMLElement;
  update(input: CostInput): void;
}

/** "Koszt przejazdu" card – the final result of the calculation. */
export function createCostSummary(): CostSummary {
  const element = document.createElement('section');
  element.className = 'cost-summary';
  element.setAttribute('aria-labelledby', 'cost-summary-title');

  const title = document.createElement('h2');
  title.className = 'cost-summary__title';
  title.id = 'cost-summary-title';
  title.textContent = 'Koszt przejazdu';

  const body = document.createElement('div');
  body.className = 'cost-summary__body';
  body.setAttribute('aria-live', 'polite');

  element.append(title, body);

  function showHint(text: string): void {
    element.dataset.state = 'hint';
    const p = document.createElement('p');
    p.className = 'cost-summary__hint';
    p.textContent = text;
    body.replaceChildren(p);
  }

  return {
    element,

    update({ route, roundTrip, settings }) {
      if (!route) return showHint('Wybierz trasę, aby policzyć koszt.');

      const { consumption, price, fuelType } = settings;
      if (consumption.status === 'empty') return showHint('Podaj spalanie, aby policzyć koszt.');
      if (consumption.status === 'invalid') return showHint('Popraw spalanie w sekcji „Paliwo”.');
      if (price.status === 'empty') return showHint('Podaj cenę paliwa, aby zobaczyć koszt.');
      if (price.status === 'invalid') return showHint('Popraw cenę paliwa w sekcji „Paliwo”.');

      const result = computeTripCost({
        distanceKm: route.distanceMeters / 1000,
        roundTrip,
        consumption: consumption.value,
        price: price.value,
      });

      element.dataset.state = 'ready';

      const amount = document.createElement('p');
      amount.className = 'cost-summary__amount';
      amount.textContent = formatCurrency(result.cost);

      const details = document.createElement('dl');
      details.className = 'cost-summary__details';
      details.append(
        ...row('Paliwo', `${formatLiters(result.liters)} ${FUEL_LABELS[fuelType]}`),
        ...row('Dystans', formatKm(result.totalKm) + (roundTrip ? ' (tam i z powrotem)' : '')),
      );

      const formula = document.createElement('p');
      formula.className = 'cost-summary__formula';
      formula.textContent = `${formatKm(result.totalKm)} × ${formatNumber(consumption.value)} l/100 km × ${formatNumber(price.value)} zł/l`;

      body.replaceChildren(amount, details, formula);
    },
  };
}

function row(term: string, value: string): [HTMLElement, HTMLElement] {
  const dt = document.createElement('dt');
  dt.textContent = term;
  const dd = document.createElement('dd');
  dd.textContent = value;
  return [dt, dd];
}
