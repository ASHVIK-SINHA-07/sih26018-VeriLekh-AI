/**
 * A fixed-window request counter, held in memory.
 *
 * Used by the public record check, the one page reachable without signing in:
 * it must not become a way to try references at speed. One process, one map —
 * enough for a single self-hosted server. Behind several app servers this
 * would move to the database or a shared cache.
 */

export interface RateWindow {
  count: number;
  start: number;
}

/** Past this many tracked keys, expired windows are swept out. */
const SWEEP_AT = 5000;

/** Whether `key` may make another request now; records it if so. */
export function allow(
  store: Map<string, RateWindow>,
  key: string,
  limit: number,
  windowMs: number,
  now: number = Date.now(),
): boolean {
  const current = store.get(key);

  if (!current || now - current.start >= windowMs) {
    if (store.size >= SWEEP_AT) {
      for (const [k, w] of store) if (now - w.start >= windowMs) store.delete(k);
    }
    store.set(key, { count: 1, start: now });
    return true;
  }

  if (current.count >= limit) return false;
  current.count += 1;
  return true;
}
