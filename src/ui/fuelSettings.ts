import { validateConsumption, validatePrice, type FieldResult } from '../calc.ts';
import { FUEL_LABELS, fuelsInUse, type AppState, type CarProfile, type FuelType } from '../state/store.ts';

export interface FuelSettingsCallbacks {
  onAddCar: () => void;
  onUpdateCar: (id: string, patch: Partial<Omit<CarProfile, 'id'>>) => void;
  onRemoveCar: (id: string) => void;
  onPriceChange: (fuel: FuelType, value: string) => void;
}

export interface FuelSettingsView {
  element: HTMLElement;
  /** Sync with the state (keeps focus/caret in fields being edited). */
  update(state: AppState): void;
}

const FUELS = Object.keys(FUEL_LABELS) as FuelType[];

/**
 * "Auta i paliwo": car profiles (the first one is the default car) and fuel prices.
 * Only prices of fuels actually used by the routes' cars are shown.
 */
export function createFuelSettings(cb: FuelSettingsCallbacks): FuelSettingsView {
  const element = document.createElement('section');
  element.className = 'panel-section fuel-settings';
  element.setAttribute('aria-labelledby', 'fuel-settings-title');

  const title = document.createElement('h2');
  title.className = 'panel-section__title';
  title.id = 'fuel-settings-title';
  title.textContent = 'Auta i paliwo';

  const carList = document.createElement('div');
  carList.className = 'car-list';

  const addCar = document.createElement('button');
  addCar.type = 'button';
  addCar.className = 'button button--add button--add-small';
  addCar.innerHTML = '<span aria-hidden="true">+</span> Dodaj auto';
  addCar.addEventListener('click', cb.onAddCar);

  const pricesTitle = document.createElement('h3');
  pricesTitle.className = 'fuel-settings__subtitle';
  pricesTitle.textContent = 'Ceny paliwa';

  const prices = document.createElement('div');
  prices.className = 'fuel-settings__prices';
  const priceFields = new Map<FuelType, NumberField>();
  for (const fuel of FUELS) {
    const field = createNumberField({
      id: `fuel-price-${fuel}`,
      label: `Cena ${FUEL_LABELS[fuel]}`,
      unit: 'zł/l',
      placeholder: 'np. 6,29',
      value: '',
      validate: validatePrice,
      onInput: (value) => cb.onPriceChange(fuel, value),
    });
    priceFields.set(fuel, field);
    prices.append(field.element);
  }

  const pricesHint = document.createElement('p');
  pricesHint.className = 'fuel-settings__hint';
  pricesHint.textContent = 'Podajesz ceny tylko tych paliw, na których jeżdżą auta wybrane w trasach.';

  element.append(title, carList, addCar, pricesTitle, prices, pricesHint);

  const rows = new Map<string, CarRow>();

  return {
    element,
    update(state) {
      // Car rows keyed by id: create, remove, reorder.
      const ids = new Set(state.cars.map((c) => c.id));
      for (const [id, row] of rows) {
        if (!ids.has(id)) {
          row.element.remove();
          rows.delete(id);
        }
      }
      state.cars.forEach((car, index) => {
        let row = rows.get(car.id);
        if (!row) {
          row = createCarRow(car, index === 0, cb);
          rows.set(car.id, row);
        }
        const current = carList.children[index];
        if (current !== row.element) carList.insertBefore(row.element, current ?? null);
        const routesUsing = state.routes.filter((r) => r.carId === car.id || (index === 0 && r.carId === null)).length;
        row.update(car, routesUsing);
      });

      const used = new Set(fuelsInUse(state));
      for (const [fuel, field] of priceFields) {
        field.element.hidden = !used.has(fuel);
        field.setValue(state.settings.prices[fuel]);
      }
    },
  };
}

// ---------- Car row ----------

interface CarRow {
  element: HTMLElement;
  update(car: CarProfile, routesUsing: number): void;
}

function createCarRow(car: CarProfile, isDefault: boolean, cb: FuelSettingsCallbacks): CarRow {
  const element = document.createElement('div');
  element.className = 'car-row';
  if (isDefault) element.dataset.default = 'true';

  const head = document.createElement('div');
  head.className = 'car-row__head';

  const name = document.createElement('input');
  Object.assign(name, { type: 'text', className: 'car-row__name', maxLength: 40, spellcheck: false });
  name.setAttribute('aria-label', 'Nazwa auta');
  name.addEventListener('input', () => cb.onUpdateCar(car.id, { name: name.value }));
  name.addEventListener('blur', () => {
    if (!name.value.trim()) {
      name.value = isDefault ? 'Moje auto' : 'Auto';
      cb.onUpdateCar(car.id, { name: name.value });
    }
  });
  name.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === 'Escape') name.blur();
  });

  const usage = document.createElement('span');
  usage.className = 'car-row__usage';
  head.append(name, usage);

  let removeButton: HTMLButtonElement | null = null;
  if (isDefault) {
    const badge = document.createElement('span');
    badge.className = 'car-row__badge';
    badge.textContent = 'domyślne';
    head.append(badge);
  } else {
    removeButton = document.createElement('button');
    removeButton.type = 'button';
    removeButton.className = 'route-card__icon-btn car-row__remove';
    removeButton.title = 'Usuń auto';
    removeButton.innerHTML =
      '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
    removeButton.addEventListener('click', () => cb.onRemoveCar(car.id));
    head.append(removeButton);
  }

  const fields = document.createElement('div');
  fields.className = 'car-row__fields';

  const consumption = createNumberField({
    id: `car-${car.id}-consumption`,
    label: 'Spalanie',
    unit: 'l/100 km',
    placeholder: '7,5',
    value: car.consumption,
    validate: validateConsumption,
    onInput: (value) => cb.onUpdateCar(car.id, { consumption: value }),
  });

  const fuel = createFuelTypePicker(`car-${car.id}-fuel`, car.fuelType, (value) =>
    cb.onUpdateCar(car.id, { fuelType: value }),
  );

  fields.append(consumption.element, fuel.element);
  element.append(head, fields);

  return {
    element,
    update(next, routesUsing) {
      if (document.activeElement !== name && name.value !== next.name) name.value = next.name;
      consumption.setValue(next.consumption);
      fuel.setValue(next.fuelType);
      usage.textContent = routesUsing > 0 ? `${routesUsing} ${routesWord(routesUsing)}` : '';
      removeButton?.setAttribute('aria-label', `Usuń auto ${next.name}`);
    },
  };
}

/** Polish plural for "trasa": 1 trasa, 2–4 trasy, 5+ tras (12–14 → tras). */
function routesWord(n: number): string {
  if (n === 1) return 'trasa';
  const last = n % 10;
  const lastTwo = n % 100;
  return last >= 2 && last <= 4 && (lastTwo < 12 || lastTwo > 14) ? 'trasy' : 'tras';
}

// ---------- Shared field helpers ----------

export interface NumberFieldOptions {
  id: string;
  label: string;
  unit: string;
  placeholder: string;
  value: string;
  validate: (input: string) => FieldResult;
  onInput: (value: string) => void;
}

export interface NumberField {
  element: HTMLElement;
  input: HTMLInputElement;
  /** Set the value (skipped while the user is typing in it) and refresh validation. */
  setValue(value: string): void;
}

/** Decimal input with a unit suffix and inline validation message. */
export function createNumberField(opts: NumberFieldOptions): NumberField {
  const element = document.createElement('div');
  element.className = 'field number-field';

  const label = document.createElement('label');
  label.className = 'field__label';
  label.htmlFor = opts.id;
  label.textContent = opts.label;

  const box = document.createElement('div');
  box.className = 'number-field__box';

  const input = document.createElement('input');
  Object.assign(input, {
    id: opts.id,
    type: 'text',
    inputMode: 'decimal',
    autocomplete: 'off',
    spellcheck: false,
    placeholder: opts.placeholder,
    value: opts.value,
  });
  input.className = 'number-field__input';

  const unit = document.createElement('span');
  unit.className = 'number-field__unit';
  unit.textContent = opts.unit;
  unit.setAttribute('aria-hidden', 'true');
  // Screen readers get the unit through the accessible name instead.
  input.setAttribute('aria-label', `${opts.label} (${opts.unit})`);

  const error = document.createElement('p');
  error.className = 'field__status is-error';
  error.id = `${opts.id}-error`;
  error.setAttribute('aria-live', 'polite');

  box.append(input, unit);
  element.append(label, box, error);

  const renderValidity = (): void => {
    const r = opts.validate(input.value);
    const invalid = r.status === 'invalid';
    error.textContent = invalid ? r.error : '';
    input.setAttribute('aria-invalid', String(invalid));
    if (invalid) input.setAttribute('aria-describedby', error.id);
    else input.removeAttribute('aria-describedby');
    element.classList.toggle('is-invalid', invalid);
  };

  input.addEventListener('input', () => {
    renderValidity();
    opts.onInput(input.value);
  });
  renderValidity();

  return {
    element,
    input,
    setValue(value) {
      if (document.activeElement === input || input.value === value) return;
      input.value = value;
      renderValidity();
    },
  };
}

function createFuelTypePicker(
  name: string,
  initial: FuelType,
  onChange: (value: FuelType) => void,
): { element: HTMLElement; setValue: (value: FuelType) => void } {
  const fieldset = document.createElement('fieldset');
  fieldset.className = 'segmented';

  const legend = document.createElement('legend');
  legend.className = 'field__label';
  legend.textContent = 'Paliwo';
  fieldset.append(legend);

  const options = document.createElement('div');
  options.className = 'segmented__options';

  const radios: HTMLInputElement[] = [];
  for (const type of FUELS) {
    const label = document.createElement('label');
    label.className = 'segmented__option';

    const radio = document.createElement('input');
    radio.type = 'radio';
    radio.name = name;
    radio.value = type;
    radio.checked = type === initial;
    radio.className = 'segmented__input';
    radio.addEventListener('change', () => {
      if (radio.checked) onChange(type);
    });

    const text = document.createElement('span');
    text.textContent = FUEL_LABELS[type];

    label.append(radio, text);
    options.append(label);
    radios.push(radio);
  }

  fieldset.append(options);
  return {
    element: fieldset,
    setValue: (value) => radios.forEach((r) => (r.checked = r.value === value)),
  };
}
