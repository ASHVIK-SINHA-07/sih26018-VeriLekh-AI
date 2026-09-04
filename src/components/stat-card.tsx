/**
 * StatCard — docs/04_Frontend_Spec.md shared components.
 * Label plus a big number. Callers pass an already-formatted string: every
 * number on screen is rounded before it gets here (CLAUDE.md guardrail).
 */
export function StatCard({
  label,
  value,
  hint,
  tone = "default",
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "default" | "flagged" | "pending";
}) {
  const valueColour =
    tone === "flagged"
      ? "text-status-flagged"
      : tone === "pending"
        ? "text-status-pending"
        : "text-navy";

  return (
    <div className="rounded-lg border border-border bg-white p-4">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className={`mt-1 text-3xl font-semibold tabular-nums ${valueColour}`}>
        {value}
      </p>
      {hint ? (
        <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}
