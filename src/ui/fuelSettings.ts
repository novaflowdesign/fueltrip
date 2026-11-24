import { validateConsumption, validatePrice, type FieldResult } from '../calc.ts';
import { FUEL_LABELS, type FuelSettingsState, type FuelType } from '../state/store.ts';

export interface FuelSettingsOptions {
  initial: FuelSettingsState;
  onChange: (patch: Partial<FuelSettingsState>) => void;
}

export interface FuelSettingsView {
  element: HTMLElement;
  /** Overwrite the inputs (e.g. after "Wyczyść wszystko"). Does not call onChange. */
  setValues(values: FuelSettingsState): void;
}

/** Global fuel settings shared by all routes: consumption, price and fuel type. */
export function createFuelSettings(opts: FuelSettingsOptions): FuelSettingsView {
  const element = document.createElement('section');
  element.className = 'panel-section fuel-settings';
  element.setAttribute('aria-labelledby', 'fuel-settings-title');

  const title = document.createElement('h2');
  title.className = 'panel-section__title';
  title.id = 'fuel-settings-title';
  title.textContent = 'Paliwo';

  const consumption = createNumberField({
    id: 'fuel-consumption',
    label: 'Spalanie',
    unit: 'l/100 km',
    placeholder: '7,5',
    value: opts.initial.consumption,
    validate: validateConsumption,
    onInput: (value) => opts.onChange({ consumption: value }),
  });

  const price = createNumberField({
    id: 'fuel-price',
    label: 'Cena paliwa',
    unit: 'zł/l',
    placeholder: 'np. 6,29',
    value: opts.initial.price,
    validate: validatePrice,
    onInput: (value) => opts.onChange({ price: value }),
  });

  const fields = document.createElement('div');
  fields.className = 'fuel-settings__fields';
  fields.append(consumption.element, price.element);

  const fuelType = createFuelTypePicker(opts.initial.fuelType, (value) => opts.onChange({ fuelType: value }));

  element.append(title, fields, fuelType.element);

  return {
    element,
    setValues(values) {
      consumption.setValue(values.consumption);
      price.setValue(values.price);
      fuelType.setValue(values.fuelType);
    },
  };
}

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
  /** Set the value programmatically and refresh the validation message. */
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
      input.value = value;
      renderValidity();
    },
  };
}

function createFuelTypePicker(
  initial: FuelType,
  onChange: (value: FuelType) => void,
): { element: HTMLElement; setValue: (value: FuelType) => void } {
  const fieldset = document.createElement('fieldset');
  fieldset.className = 'segmented';

  const legend = document.createElement('legend');
  legend.className = 'field__label';
  legend.textContent = 'Rodzaj paliwa';
  fieldset.append(legend);

  const options = document.createElement('div');
  options.className = 'segmented__options';

  const radios: HTMLInputElement[] = [];
  for (const type of Object.keys(FUEL_LABELS) as FuelType[]) {
    const label = document.createElement('label');
    label.className = 'segmented__option';

    const radio = document.createElement('input');
    radio.type = 'radio';
    radio.name = 'fuel-type';
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
