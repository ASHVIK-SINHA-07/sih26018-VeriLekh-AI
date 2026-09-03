/**
 * Empty state — docs/04_Frontend_Spec.md: every list and table has one.
 * A blank panel with no explanation reads as a bug.
 */
export function EmptyState({
  title,
  hint,
}: {
  title: string;
  hint?: string;
}) {
  return (
    <div className="rounded-lg border border-dashed border-border bg-white/50 px-6 py-10 text-center">
      <p className="text-sm font-medium text-foreground">{title}</p>
      {hint ? (
        <p className="mt-1 text-sm text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}
