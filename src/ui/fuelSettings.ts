import { validateConsumption, validatePrice, type FieldResult } from '../calc.ts';

export type FuelType = 'pb95' | 'on' | 'lpg';

export const FUEL_LABELS: Record<FuelType, string> = {
  pb95: 'Pb95',
  on: 'ON',
  lpg: 'LPG',
};

export interface FuelSettingsValue {
  consumption: FieldResult;
  price: FieldResult;
  fuelType: FuelType;
}

export interface FuelSettingsOptions {
  initial: { consumption: string; price: string; fuelType: FuelType };
  onChange: (value: FuelSettingsValue) => void;
}

export interface FuelSettings {
  element: HTMLElement;
  getValue(): FuelSettingsValue;
}

/** Global fuel settings: consumption, price and fuel type. */
export function createFuelSettings(opts: FuelSettingsOptions): FuelSettings {
  const element = document.createElement('section');
  element.className = 'panel-section fuel-settings';
  element.setAttribute('aria-labelledby', 'fuel-settings-title');

  const title = document.createElement('h2');
  title.className = 'panel-section__title';
  title.id = 'fuel-settings-title';
  title.textContent = 'Paliwo';

  const emit = (): void => opts.onChange(getValue());

  const consumption = createNumberField({
    id: 'fuel-consumption',
    label: 'Spalanie',
    unit: 'l/100 km',
    placeholder: '7,5',
    value: opts.initial.consumption,
    validate: validateConsumption,
    onInput: emit,
  });

  const price = createNumberField({
    id: 'fuel-price',
    label: 'Cena paliwa',
    unit: 'zł/l',
    placeholder: 'np. 6,29',
    value: opts.initial.price,
    validate: validatePrice,
    onInput: emit,
  });

  const fields = document.createElement('div');
  fields.className = 'fuel-settings__fields';
  fields.append(consumption.element, price.element);

  const fuelType = createFuelTypePicker(opts.initial.fuelType, emit);

  element.append(title, fields, fuelType.element);

  function getValue(): FuelSettingsValue {
    return { consumption: consumption.result(), price: price.result(), fuelType: fuelType.value() };
  }

  return { element, getValue };
}

interface NumberFieldOptions {
  id: string;
  label: string;
  unit: string;
  placeholder: string;
  value: string;
  validate: (input: string) => FieldResult;
  onInput: () => void;
}

function createNumberField(opts: NumberFieldOptions): { element: HTMLElement; result: () => FieldResult } {
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

  const result = (): FieldResult => opts.validate(input.value);

  const renderValidity = (): void => {
    const r = result();
    const invalid = r.status === 'invalid';
    error.textContent = invalid ? r.error : '';
    input.setAttribute('aria-invalid', String(invalid));
    if (invalid) input.setAttribute('aria-describedby', error.id);
    else input.removeAttribute('aria-describedby');
    element.classList.toggle('is-invalid', invalid);
  };

  input.addEventListener('input', () => {
    renderValidity();
    opts.onInput();
  });
  renderValidity();

  return { element, result };
}

function createFuelTypePicker(
  initial: FuelType,
  onChange: () => void,
): { element: HTMLElement; value: () => FuelType } {
  const fieldset = document.createElement('fieldset');
  fieldset.className = 'segmented';

  const legend = document.createElement('legend');
  legend.className = 'field__label';
  legend.textContent = 'Rodzaj paliwa';
  fieldset.append(legend);

  const options = document.createElement('div');
  options.className = 'segmented__options';

  const radios = (Object.keys(FUEL_LABELS) as FuelType[]).map((type) => {
    const label = document.createElement('label');
    label.className = 'segmented__option';

    const radio = document.createElement('input');
    radio.type = 'radio';
    radio.name = 'fuel-type';
    radio.value = type;
    radio.checked = type === initial;
    radio.className = 'segmented__input';
    radio.addEventListener('change', onChange);

    const text = document.createElement('span');
    text.textContent = FUEL_LABELS[type];

    label.append(radio, text);
    options.append(label);
    return radio;
  });

  fieldset.append(options);

  return {
    element: fieldset,
    value: () => (radios.find((r) => r.checked)?.value as FuelType | undefined) ?? initial,
  };
}
