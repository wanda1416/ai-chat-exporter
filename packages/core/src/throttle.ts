/** Resolves after `ms` milliseconds. */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Wraps an async producer so consecutive calls are spaced by at least `minMs`.
 * Used to keep request rate polite (blueprint: ~500ms/request), so the tool
 * never puts pressure on a platform.
 */
export function throttled<A extends unknown[], R>(
  fn: (...args: A) => Promise<R>,
  minMs: number,
): (...args: A) => Promise<R> {
  let last = 0;
  return async (...args: A): Promise<R> => {
    const wait = last + minMs - Date.now();
    if (wait > 0) await sleep(wait);
    last = Date.now();
    return fn(...args);
  };
}
