export interface Debounced<A extends unknown[]> {
  (...args: A): void;
  /** Drop a pending call, if any. */
  cancel(): void;
}

/** Delay calling `fn` until `waitMs` has passed without another call. */
export function debounce<A extends unknown[]>(fn: (...args: A) => void, waitMs: number): Debounced<A> {
  let timer: ReturnType<typeof setTimeout> | undefined;

  const debounced = (...args: A): void => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      timer = undefined;
      fn(...args);
    }, waitMs);
  };

  debounced.cancel = (): void => {
    clearTimeout(timer);
    timer = undefined;
  };

  return debounced;
}
