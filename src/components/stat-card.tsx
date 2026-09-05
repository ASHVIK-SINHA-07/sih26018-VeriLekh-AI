/**
 * One figure in the KPI strip.
 *
 * A tile in a ruled row, not a floating card: separation is a single vertical
 * rule between neighbours. The figure is the largest thing on the screen and
 * carries a coloured accent bar when it needs attention.
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
  const accent =
    tone === "flagged"
      ? "bg-status-flagged"
      : tone === "pending"
        ? "bg-status-pending"
        : "bg-navy";
  const figure =
    tone === "flagged" ? "text-status-flagged" : "text-navy";

  return (
    <div className="relative px-5 py-4 sm:px-6 sm:py-5">
      <span className={`absolute top-5 bottom-5 left-0 w-[3px] ${accent}`} />
      <p className="label-cap">{label}</p>
      <p className={`mt-2 font-serif text-[2.5rem] leading-none tabular-nums ${figure}`}>
        {value}
      </p>
      {hint ? (
        <p className="mt-2 text-[12px] text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}
