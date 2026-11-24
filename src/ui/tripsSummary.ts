import { PEOPLE_RANGE, splitCost, type TripEvaluation, type TripsSummary } from '../calc.ts';
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
  people: number;
}

export interface TripsSummaryOptions {
  onSelect: (id: string) => void;
  onShowAll: () => void;
  onPeopleChange: (people: number) => void;
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

  // Persistent controls (outside the re-rendered body, so buttons keep focus).
  const split = createSplit(opts.onPeopleChange);

  const showAll = document.createElement('button');
  showAll.type = 'button';
  showAll.className = 'button button--secondary cost-summary__show-all';
  showAll.textContent = 'Pokaż wszystkie trasy na mapie';
  showAll.addEventListener('click', opts.onShowAll);

  element.append(title, body, split.element, showAll);

  return {
    element,

    update({ items, totals, people }) {
      showAll.hidden = totals.includedCount < 2;
      split.update(totals.cost, people);

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
        nodes.push(text('p', 'cost-summary__hint cost-summary__hint--block', missingCostReason(totals.fuelsMissingPrice)));
      }

      const details = document.createElement('dl');
      details.className = 'cost-summary__details';
      details.append(
        ...row(
          totals.includedCount > 1 ? 'Dystans łącznie' : 'Dystans',
          animatedNumber('total-km', totals.totalKm, formatKm),
        ),
      );
      // One row per fuel used, e.g. "Paliwo Pb95 32,9 l" and "Paliwo LPG 12,4 l".
      const fuels = Object.entries(totals.litersByFuel) as Array<[FuelType, number]>;
      for (const [fuel, liters] of fuels) {
        const label = FUEL_LABELS[fuel];
        details.append(
          ...row(
            fuels.length > 1 ? `Paliwo ${label}` : 'Paliwo',
            animatedNumber(`total-liters-${fuel}`, liters, (l) => (fuels.length > 1 ? formatLiters(l) : `${formatLiters(l)} ${label}`)),
          ),
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

      body.replaceChildren(...nodes);
    },
  };
}

/** "Liczba osób: − N +" stepper with the per-person amount. */
function createSplit(onChange: (people: number) => void): {
  element: HTMLElement;
  update: (cost: number | null, people: number) => void;
} {
  const element = document.createElement('div');
  element.className = 'split';
  element.hidden = true;

  const row = document.createElement('div');
  row.className = 'split__row';

  const label = text('span', 'split__label', 'Liczba osób');
  label.id = 'split-label';

  const stepper = document.createElement('div');
  stepper.className = 'stepper';
  stepper.setAttribute('role', 'group');
  stepper.setAttribute('aria-labelledby', 'split-label');

  const minus = stepButton('−', 'Mniej osób');
  const plus = stepButton('+', 'Więcej osób');
  const value = document.createElement('output');
  value.className = 'stepper__value';
  value.setAttribute('aria-live', 'polite');
  stepper.append(minus, value, plus);
  row.append(label, stepper);

  const result = document.createElement('p');
  result.className = 'split__result';
  result.setAttribute('aria-live', 'polite');

  element.append(row, result);

  let current = 1;
  minus.addEventListener('click', () => onChange(current - 1));
  plus.addEventListener('click', () => onChange(current + 1));

  return {
    element,
    update(cost, people) {
      current = people;
      element.hidden = cost === null;
      value.textContent = String(people);
      minus.disabled = people <= PEOPLE_RANGE.min;
      plus.disabled = people >= PEOPLE_RANGE.max;
      if (cost === null) return;

      if (people === 1) {
        result.replaceChildren(text('span', 'split__hint', 'Dodaj osoby, aby podzielić koszt.'));
        return;
      }
      const s = splitCost(cost, people);
      const nodes: Node[] = [
        text('span', '', 'Na osobę: '),
        animatedNumber('per-person', s.perPerson, formatCurrency, 'split__amount'),
      ];
      // Rounding up to full grosze can collect a bit more than the cost – say so.
      if (s.collected !== cost) {
        nodes.push(text('span', 'split__note', ` (razem ${formatCurrency(s.collected)})`));
      }
      result.replaceChildren(...nodes);
    },
  };
}

function stepButton(symbol: string, label: string): HTMLButtonElement {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'stepper__btn';
  b.textContent = symbol;
  b.setAttribute('aria-label', label);
  return b;
}

function missingCostReason(fuels: FuelType[]): string {
  if (fuels.length === 0) return 'Uzupełnij spalanie, aby zobaczyć koszt.';
  const names = fuels.map((f) => FUEL_LABELS[f]).join(' i ');
  return `Podaj cenę ${names} w sekcji „Auta i paliwo”, aby zobaczyć koszt.`;
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
      nameCell(item.name, e.distance?.times ?? 1),
      text('span', 'breakdown__km', e.distance ? formatKm(e.distance.totalKm) : '—'),
      text('span', 'breakdown__cost', e.cost !== null ? formatCurrency(e.cost) : '—'),
    );
    if (!e.distance) button.classList.add('is-incomplete');

    li.append(button);
    list.append(li);
  }
  return list;
}

/** Route name (ellipsized) + a "×3" badge that never gets cut off. */
function nameCell(name: string, times: number): HTMLElement {
  const cell = text('span', 'breakdown__name', '');
  cell.append(text('span', 'breakdown__name-text', name));
  if (times > 1) {
    const badge = text('span', 'breakdown__times', `×${times}`);
    badge.title = `${times} razy`;
    cell.append(badge);
  }
  return cell;
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
