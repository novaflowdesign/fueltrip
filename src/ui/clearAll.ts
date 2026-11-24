export interface ClearAllOptions {
  onConfirm: () => void;
}

/**
 * "Wyczyść wszystko" with an inline confirmation step (no window.confirm()).
 * Esc or "Anuluj" goes back; focus moves sensibly between the two states.
 */
export function createClearAll(opts: ClearAllOptions): HTMLElement {
  const element = document.createElement('div');
  element.className = 'clear-all';

  const trigger = button('button button--ghost clear-all__trigger', 'Wyczyść wszystko');

  const confirm = document.createElement('div');
  confirm.className = 'clear-all__confirm';
  confirm.setAttribute('role', 'group');
  confirm.setAttribute('aria-labelledby', 'clear-all-question');
  confirm.hidden = true;

  const question = document.createElement('p');
  question.id = 'clear-all-question';
  question.className = 'clear-all__question';
  question.textContent = 'Usunąć wszystkie trasy i ustawienia? Tej operacji nie można cofnąć.';

  const actions = document.createElement('div');
  actions.className = 'clear-all__actions';
  const cancel = button('button button--secondary', 'Anuluj');
  const ok = button('button button--danger', 'Wyczyść');
  actions.append(cancel, ok);
  confirm.append(question, actions);

  element.append(trigger, confirm);

  const setOpen = (open: boolean): void => {
    trigger.hidden = open;
    confirm.hidden = !open;
    (open ? cancel : trigger).focus();
  };

  trigger.addEventListener('click', () => setOpen(true));
  cancel.addEventListener('click', () => setOpen(false));
  confirm.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') setOpen(false);
  });
  ok.addEventListener('click', () => {
    trigger.hidden = false;
    confirm.hidden = true;
    opts.onConfirm();
  });

  return element;
}

function button(className: string, text: string): HTMLButtonElement {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = className;
  b.textContent = text;
  return b;
}
