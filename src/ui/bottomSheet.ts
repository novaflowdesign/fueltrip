/**
 * Mobile bottom sheet: on narrow screens the side panel becomes a sheet over a
 * full-screen map with three snap points – collapsed (header + total only),
 * half and full. Drag the header/handle, tap the handle, or use the keyboard
 * (the handle is a button; ↑/↓ also work). On wide screens it does nothing.
 */
export type SheetState = 'collapsed' | 'half' | 'full';

export interface BottomSheetOptions {
  panel: HTMLElement;
  header: HTMLElement;
  handle: HTMLButtonElement;
  /** Called with the px of map covered by the sheet (0 on desktop). */
  onInsetChange: (px: number) => void;
}

export interface BottomSheet {
  setState(state: SheetState): void;
  state(): SheetState;
  isActive(): boolean;
}

const MOBILE_QUERY = window.matchMedia('(max-width: 760px)');
const ORDER: SheetState[] = ['collapsed', 'half', 'full'];
const TOP_GAP = 56; // map strip left visible above a fully open sheet
const DRAG_THRESHOLD = 6;
const FLICK_VELOCITY = 0.5; // px per ms

export function createBottomSheet(opts: BottomSheetOptions): BottomSheet {
  const { panel, header, handle } = opts;
  let current: SheetState = 'half';
  let height = 0;

  const heights = (): Record<SheetState, number> => {
    const viewport = window.innerHeight;
    const collapsed = Math.min(header.offsetHeight + 4, viewport * 0.4);
    const full = viewport - TOP_GAP;
    const half = Math.max(collapsed + 80, Math.min(full, Math.round(viewport * 0.5)));
    return { collapsed, half, full };
  };

  function apply(px: number): void {
    height = px;
    panel.style.height = `${Math.round(px)}px`;
    document.documentElement.style.setProperty('--sheet-height', `${Math.round(px)}px`);
    opts.onInsetChange(px);
  }

  function setState(state: SheetState): void {
    current = state;
    panel.dataset.sheet = state;
    const labels: Record<SheetState, string> = {
      collapsed: 'Rozwiń panel',
      half: 'Rozwiń panel na cały ekran',
      full: 'Zwiń panel',
    };
    handle.setAttribute('aria-label', labels[state]);
    handle.setAttribute('aria-expanded', String(state !== 'collapsed'));
    if (MOBILE_QUERY.matches) apply(heights()[state]);
  }

  function sync(): void {
    if (MOBILE_QUERY.matches) {
      panel.classList.add('is-sheet');
      setState(current);
    } else {
      panel.classList.remove('is-sheet', 'is-dragging');
      panel.style.removeProperty('height');
      delete panel.dataset.sheet;
      document.documentElement.style.removeProperty('--sheet-height');
      opts.onInsetChange(0);
    }
  }

  // ----- tap / keyboard on the handle -----
  let suppressClick = false;
  handle.addEventListener('click', () => {
    if (suppressClick) {
      suppressClick = false;
      return;
    }
    setState(ORDER[(ORDER.indexOf(current) + 1) % ORDER.length]!);
  });
  handle.addEventListener('keydown', (e) => {
    const index = ORDER.indexOf(current);
    if (e.key === 'ArrowUp' && index < ORDER.length - 1) setState(ORDER[index + 1]!);
    else if (e.key === 'ArrowDown' && index > 0) setState(ORDER[index - 1]!);
    else return;
    e.preventDefault();
  });

  // ----- drag (handle + header, but not the theme switch) -----
  let drag: { startY: number; startHeight: number; lastY: number; lastT: number; velocity: number; moved: boolean } | null =
    null;

  header.addEventListener('pointerdown', (e) => {
    if (!MOBILE_QUERY.matches || e.button !== 0) return;
    if ((e.target as HTMLElement).closest('.theme-switch')) return;
    drag = { startY: e.clientY, startHeight: height, lastY: e.clientY, lastT: e.timeStamp, velocity: 0, moved: false };
    header.setPointerCapture(e.pointerId);
  });

  header.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const dy = drag.startY - e.clientY;
    if (!drag.moved && Math.abs(dy) < DRAG_THRESHOLD) return;
    if (!drag.moved) {
      drag.moved = true;
      panel.classList.add('is-dragging');
    }
    const dt = Math.max(1, e.timeStamp - drag.lastT);
    drag.velocity = (drag.lastY - e.clientY) / dt; // > 0 = moving up
    drag.lastY = e.clientY;
    drag.lastT = e.timeStamp;
    const h = heights();
    apply(Math.min(h.full, Math.max(h.collapsed, drag.startHeight + dy)));
  });

  const endDrag = (): void => {
    if (!drag) return;
    const { moved, velocity } = drag;
    drag = null;
    panel.classList.remove('is-dragging');
    if (!moved) return;
    suppressClick = true;
    setTimeout(() => (suppressClick = false), 0);

    const h = heights();
    let target: SheetState;
    if (Math.abs(velocity) > FLICK_VELOCITY) {
      // A flick moves one step in its direction, from the nearest snap point.
      const nearest = nearestState(h, height);
      const index = ORDER.indexOf(nearest) + (velocity > 0 ? 1 : -1);
      target = ORDER[Math.min(ORDER.length - 1, Math.max(0, index))]!;
    } else {
      target = nearestState(h, height);
    }
    setState(target);
  };
  header.addEventListener('pointerup', endDrag);
  header.addEventListener('pointercancel', endDrag);

  // Typing in a collapsed sheet would be invisible – open it.
  panel.addEventListener('focusin', (e) => {
    if (MOBILE_QUERY.matches && current === 'collapsed' && !header.contains(e.target as Node)) setState('half');
  });

  MOBILE_QUERY.addEventListener('change', sync);
  window.addEventListener('resize', () => {
    if (MOBILE_QUERY.matches && !drag) apply(heights()[current]);
  });
  sync();

  return { setState, state: () => current, isActive: () => MOBILE_QUERY.matches };
}

function nearestState(h: Record<SheetState, number>, px: number): SheetState {
  return ORDER.reduce((best, s) => (Math.abs(h[s] - px) < Math.abs(h[best] - px) ? s : best), ORDER[0]!);
}
