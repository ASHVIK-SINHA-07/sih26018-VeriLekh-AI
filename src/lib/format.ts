/**
 * Display formatting.
 *
 * CLAUDE.md guardrail: every number shown in the UI is rounded — no
 * floating-point artefacts on screen, ever.
 */

/** 0.8734 → "87%" */
export function asPercent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

/** Whole numbers only, with thousands separators. */
export function asCount(value: number): string {
  return Math.round(value).toLocaleString("en-IN");
}

/** "2 hours ago", "just now" — for list rows. */
export function asRelativeTime(value: string | Date): string {
  const then = typeof value === "string" ? new Date(value) : value;
  const seconds = Math.round((Date.now() - then.getTime()) / 1000);

  if (seconds < 60) return "just now";

  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ["minute", 60], ["hour", 3600], ["day", 86400],
    ["week", 604800], ["month", 2592000], ["year", 31536000],
  ];

  let chosen: Intl.RelativeTimeFormatUnit = "minute";
  let divisor = 60;
  for (const [unit, size] of units) {
    if (seconds >= size) {
      chosen = unit;
      divisor = size;
    }
  }

  const formatter = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  return formatter.format(-Math.round(seconds / divisor), chosen);
}
