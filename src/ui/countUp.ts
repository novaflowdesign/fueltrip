/**
 * Animated numbers ("count-up"). Each value has a stable key (e.g. "total-cost"),
 * so even when the surrounding DOM is re-rendered the number animates from what
 * was on screen to the new value instead of jumping.
 *
 * Screen readers get only the final value: the animated text is aria-hidden and
 * a visually hidden copy holds the target.
 */

const DURATION_MS = 550;

interface Track {
  /** Value currently shown (mid-animation too). */
  shown: number;
  frame: number | null;
}

const tracks = new Map<string, Track>();

export function animatedNumber(
  key: string,
  value: number,
  format: (n: number) => string,
  className = '',
): HTMLElement {
  const wrap = document.createElement('span');
  if (className) wrap.className = className;

  const visual = document.createElement('span');
  visual.setAttribute('aria-hidden', 'true');
  const spoken = document.createElement('span');
  spoken.className = 'sr-only';
  spoken.textContent = format(value);
  wrap.append(visual, spoken);

  const track = tracks.get(key);
  if (track?.frame != null) cancelAnimationFrame(track.frame);

  const from = track?.shown;
  if (from === undefined || from === value || reducedMotion()) {
    visual.textContent = format(value);
    tracks.set(key, { shown: value, frame: null });
    return wrap;
  }

  const state: Track = { shown: from, frame: null };
  tracks.set(key, state);
  const start = performance.now();
  const tick = (now: number): void => {
    const t = Math.min(1, (now - start) / DURATION_MS);
    state.shown = from + (value - from) * easeOutCubic(t);
    visual.textContent = format(t < 1 ? state.shown : value);
    if (t < 1) {
      state.frame = requestAnimationFrame(tick);
    } else {
      state.shown = value;
      state.frame = null;
    }
  };
  visual.textContent = format(from);
  state.frame = requestAnimationFrame(tick);
  return wrap;
}

/** Forget a key (e.g. a removed route) so a future value doesn't animate from a stale one. */
export function forgetNumber(key: string): void {
  const track = tracks.get(key);
  if (track?.frame != null) cancelAnimationFrame(track.frame);
  tracks.delete(key);
}

function easeOutCubic(t: number): number {
  return 1 - (1 - t) ** 3;
}

function reducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}
