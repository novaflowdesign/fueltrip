export interface ToastAction {
  label: string;
  onClick: () => void;
}

export interface Toaster {
  show(message: string, action?: ToastAction, timeoutMs?: number): void;
  hide(): void;
}

/** Single, non-blocking notification (e.g. "Usunięto trasę · Cofnij"). */
export function createToaster(container: HTMLElement): Toaster {
  const element = document.createElement('div');
  element.className = 'toast';
  element.setAttribute('role', 'status');
  element.setAttribute('aria-live', 'polite');
  element.hidden = true;
  container.append(element);

  let timer: ReturnType<typeof setTimeout> | undefined;

  function hide(): void {
    clearTimeout(timer);
    element.hidden = true;
    element.replaceChildren();
  }

  function show(message: string, action?: ToastAction, timeoutMs = 6000): void {
    clearTimeout(timer);
    const text = document.createElement('span');
    text.className = 'toast__message';
    text.textContent = message;
    element.replaceChildren(text);

    if (action) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'toast__action';
      button.textContent = action.label;
      button.addEventListener('click', () => {
        hide();
        action.onClick();
      });
      element.append(button);
    }

    element.hidden = false;
    timer = setTimeout(hide, timeoutMs);
  }

  return { show, hide };
}
