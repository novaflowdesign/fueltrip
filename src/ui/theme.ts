/**
 * Light / dark theme: "auto" follows the OS, "light"/"dark" force it.
 * The choice is stored separately from the app data (it's a UI preference,
 * so "Wyczyść wszystko" doesn't reset it). `index.html` applies it before
 * first paint to avoid a flash of the wrong theme.
 */
export type ThemePreference = 'auto' | 'light' | 'dark';
export type Theme = 'light' | 'dark';

export const THEME_STORAGE_KEY = 'fueltrip:theme';

const darkQuery = window.matchMedia('(prefers-color-scheme: dark)');

export function loadThemePreference(): ThemePreference {
  try {
    const value = localStorage.getItem(THEME_STORAGE_KEY);
    return value === 'light' || value === 'dark' ? value : 'auto';
  } catch {
    return 'auto';
  }
}

function saveThemePreference(pref: ThemePreference): void {
  try {
    if (pref === 'auto') localStorage.removeItem(THEME_STORAGE_KEY);
    else localStorage.setItem(THEME_STORAGE_KEY, pref);
  } catch {
    // Not persisted – fine, it still applies for this session.
  }
}

export function resolveTheme(pref: ThemePreference): Theme {
  if (pref === 'auto') return darkQuery.matches ? 'dark' : 'light';
  return pref;
}

function applyToDocument(pref: ThemePreference): void {
  const root = document.documentElement;
  if (pref === 'auto') delete root.dataset.theme;
  else root.dataset.theme = pref;

  // Keep the browser UI (mobile address bar) in sync with the panel background.
  const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (meta) meta.content = resolveTheme(pref) === 'dark' ? '#141d1b' : '#ffffff';
}

export interface ThemeController {
  element: HTMLElement;
  current(): Theme;
}

const OPTIONS: Array<{ value: ThemePreference; label: string; icon: string }> = [
  {
    value: 'light',
    label: 'Jasny motyw',
    icon: '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><circle cx="12" cy="12" r="4" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  },
  {
    value: 'auto',
    label: 'Motyw systemowy',
    icon: '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 4a8 8 0 0 1 0 16z" fill="currentColor"/></svg>',
  },
  {
    value: 'dark',
    label: 'Ciemny motyw',
    icon: '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>',
  },
];

/** Three-way switch (Jasny / Auto / Ciemny); calls `onChange` with the resolved theme. */
export function createThemeSwitch(onChange: (theme: Theme) => void): ThemeController {
  let pref = loadThemePreference();
  applyToDocument(pref);

  const element = document.createElement('div');
  element.className = 'theme-switch';
  element.setAttribute('role', 'radiogroup');
  element.setAttribute('aria-label', 'Motyw');

  const buttons = OPTIONS.map((option) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'theme-switch__option';
    button.setAttribute('role', 'radio');
    button.setAttribute('aria-label', option.label);
    button.title = option.label;
    button.innerHTML = option.icon;
    button.addEventListener('click', () => select(option.value, true));
    element.append(button);
    return { option, button };
  });

  // Arrow keys move between options (radiogroup pattern).
  element.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    const index = OPTIONS.findIndex((o) => o.value === pref);
    const next = OPTIONS[(index + (e.key === 'ArrowRight' ? 1 : OPTIONS.length - 1)) % OPTIONS.length]!;
    select(next.value, true);
    buttons.find((b) => b.option.value === next.value)?.button.focus();
  });

  function render(): void {
    for (const { option, button } of buttons) {
      const checked = option.value === pref;
      button.setAttribute('aria-checked', String(checked));
      button.tabIndex = checked ? 0 : -1;
    }
  }

  function select(value: ThemePreference, persist: boolean): void {
    const before = resolveTheme(pref);
    pref = value;
    if (persist) saveThemePreference(value);
    applyToDocument(value);
    render();
    const after = resolveTheme(pref);
    if (after !== before) onChange(after);
  }

  // Follow OS changes while in "auto".
  darkQuery.addEventListener('change', () => {
    if (pref !== 'auto') return;
    applyToDocument(pref);
    onChange(resolveTheme(pref));
  });

  render();
  return { element, current: () => resolveTheme(pref) };
}
