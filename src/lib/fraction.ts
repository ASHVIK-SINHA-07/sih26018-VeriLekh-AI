/**
 * Exact fractions for ownership shares.
 *
 * Land is divided in thirds, sixths and twelfths. In floating point, three
 * heirs holding 1/3 each own 0.9999999999999999 of the parcel, and a check
 * for "shares exceed the whole" either fires on every inheritance or has to
 * be loosened until it misses real over-allocation. Integer numerator and
 * denominator, always reduced, keep the arithmetic exact.
 */

export interface Fraction {
  n: number;
  d: number;
}

function gcd(a: number, b: number): number {
  a = Math.abs(a);
  b = Math.abs(b);
  while (b) [a, b] = [b, a % b];
  return a || 1;
}

export function frac(n: number, d = 1): Fraction {
  if (d === 0) throw new Error("Fraction with zero denominator");
  if (d < 0) { n = -n; d = -d; }
  const g = gcd(n, d);
  return { n: n / g, d: d / g };
}

export const ZERO = frac(0);
export const ONE = frac(1);

/**
 * Parse a share as written in a register: "1", "1/2", "0.5", "½".
 * Returns null for anything that is not a share, rather than guessing.
 */
export function parseShare(raw: string | null | undefined): Fraction | null {
  if (raw == null) return null;
  const text = raw.trim()
    .replace("½", "1/2").replace("⅓", "1/3").replace("¼", "1/4")
    .replace("⅔", "2/3").replace("¾", "3/4");
  if (!text) return null;

  const slash = text.match(/^(\d+)\s*\/\s*(\d+)$/);
  if (slash) {
    const d = Number(slash[2]);
    return d === 0 ? null : frac(Number(slash[1]), d);
  }

  const decimal = text.match(/^(\d+)(?:\.(\d+))?$/);
  if (decimal) {
    const places = decimal[2]?.length ?? 0;
    const scale = 10 ** places;
    return frac(Number(decimal[1]) * scale + Number(decimal[2] ?? 0), scale);
  }

  return null;
}

export function add(a: Fraction, b: Fraction): Fraction {
  return frac(a.n * b.d + b.n * a.d, a.d * b.d);
}

export function sub(a: Fraction, b: Fraction): Fraction {
  return frac(a.n * b.d - b.n * a.d, a.d * b.d);
}

/** Negative when a < b, zero when equal, positive when a > b. */
export function compare(a: Fraction, b: Fraction): number {
  return a.n * b.d - b.n * a.d;
}

export function isZero(a: Fraction): boolean {
  return a.n === 0;
}

export function format(a: Fraction): string {
  if (a.d === 1) return String(a.n);
  return `${a.n}/${a.d}`;
}
