import type { FieldResult, TripEvaluation, TripsSummary } from '../calc.ts';
import { FUEL_LABELS, type FuelType } from '../state/store.ts';
import { formatCurrency, formatKm, formatLiters } from '../utils/format.ts';
import { animatedNumber } from './countUp.ts';

export interface SummaryItem {
  id: string;
  name: string;
  color: string;
  evaluation: TripEvaluation;
}

export interface SummaryInput {
  items: SummaryItem[];
  totals: TripsSummary;
  price: FieldResult;
  fuelType: FuelType;
}

export interface TripsSummaryOptions {
  onSelect: (id: string) => void;
  onShowAll: () => void;
}

export interface TripsSummaryView {
  element: HTMLElement;
  update(input: SummaryInput): void;
}

/** "Podsumowanie" card at the bottom: totals for all routes + per-route breakdown. */
export function createTripsSummary(opts: TripsSummaryOptions): TripsSummaryView {
  const element = document.createElement('section');
  element.className = 'cost-summary';
  element.setAttribute('aria-labelledby', 'trips-summary-title');

  const title = document.createElement('h2');
  title.className = 'cost-summary__title';
  title.id = 'trips-summary-title';
  title.textContent = 'Podsumowanie';

  const body = document.createElement('div');
  body.className = 'cost-summary__body';
  body.setAttribute('aria-live', 'polite');

  element.append(title, body);

  return {
    element,

    update({ items, totals, price, fuelType }) {
      if (totals.includedCount === 0) {
        element.dataset.state = 'hint';
        body.replaceChildren(text('p', 'cost-summary__hint', 'Wybierz trasę, aby policzyć koszt.'));
        return;
      }

      element.dataset.state = totals.cost !== null ? 'ready' : 'partial';
      const nodes: Node[] = [];

      if (totals.cost !== null) {
        const amount = text('p', 'cost-summary__amount', '');
        amount.append(animatedNumber('total-cost', totals.cost, formatCurrency));
        nodes.push(amount);
      } else {
        nodes.push(text('p', 'cost-summary__hint cost-summary__hint--block', missingCostReason(price)));
      }

      const details = document.createElement('dl');
      details.className = 'cost-summary__details';
      details.append(
        ...row(
          totals.includedCount > 1 ? 'Dystans łącznie' : 'Dystans',
          animatedNumber('total-km', totals.totalKm, formatKm),
        ),
      );
      if (totals.liters !== null) {
        const label = FUEL_LABELS[fuelType];
        details.append(
          ...row('Paliwo', animatedNumber('total-liters', totals.liters, (l) => `${formatLiters(l)} ${label}`)),
        );
      }
      nodes.push(details);

      if (items.length > 1) nodes.push(breakdown(items, opts.onSelect));

      if (totals.skippedCount > 0) {
        nodes.push(
          text(
            'p',
            'cost-summary__note',
            `${totals.skippedCount} ${plural(totals.skippedCount, 'trasa', 'trasy', 'tras')} bez wyznaczonej drogi – nie ${totals.skippedCount === 1 ? 'jest wliczona' : 'są wliczone'}.`,
          ),
        );
      }

      if (totals.includedCount > 1) {
        const showAll = document.createElement('button');
        showAll.type = 'button';
        showAll.className = 'button button--secondary cost-summary__show-all';
        showAll.textContent = 'Pokaż wszystkie trasy na mapie';
        showAll.addEventListener('click', opts.onShowAll);
        nodes.push(showAll);
      }

      body.replaceChildren(...nodes);
    },
  };
}

function missingCostReason(price: FieldResult): string {
  if (price.status === 'empty') return 'Podaj cenę paliwa, aby zobaczyć koszt.';
  if (price.status === 'invalid') return 'Popraw cenę paliwa w sekcji „Paliwo”.';
  return 'Popraw spalanie, aby zobaczyć koszt.';
}

function breakdown(items: SummaryItem[], onSelect: (id: string) => void): HTMLElement {
  const list = document.createElement('ul');
  list.className = 'breakdown';
  list.setAttribute('aria-label', 'Koszt poszczególnych tras');

  for (const item of items) {
    const li = document.createElement('li');
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'breakdown__item';
    button.style.setProperty('--route-color', item.color);
    button.title = 'Pokaż na mapie';
    button.addEventListener('click', () => onSelect(item.id));

    const e = item.evaluation;
    const dot = text('span', 'breakdown__dot', '');
    dot.setAttribute('aria-hidden', 'true');
    button.append(
      dot,
      text('span', 'breakdown__name', item.name),
      text('span', 'breakdown__km', e.distance ? formatKm(e.distance.totalKm) : '—'),
      text('span', 'breakdown__cost', e.cost !== null ? formatCurrency(e.cost) : '—'),
    );
    if (!e.distance) button.classList.add('is-incomplete');

    li.append(button);
    list.append(li);
  }
  return list;
}

/** Polish plural: 1 trasa, 2–4 trasy, 5+ tras (12–14 → tras). */
function plural(n: number, one: string, few: string, many: string): string {
  if (n === 1) return one;
  const lastTwo = n % 100;
  const last = n % 10;
  return last >= 2 && last <= 4 && (lastTwo < 12 || lastTwo > 14) ? few : many;
}

function row(term: string, value: string | Node): [HTMLElement, HTMLElement] {
  const dd = text('dd', '', '');
  dd.append(value);
  return [text('dt', '', term), dd];
}

function text<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, content: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  node.textContent = content;
  return node;
}
