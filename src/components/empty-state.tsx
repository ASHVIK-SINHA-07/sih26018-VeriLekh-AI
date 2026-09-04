/**
 * Empty state — a ruled note on the paper, not a dashed box.
 */
export function EmptyState({
  title,
  hint,
}: {
  title: string;
  hint?: string;
}) {
  return (
    <div className="border border-dashed border-rule px-6 py-10 text-center">
      <p className="text-[14px] font-medium text-foreground">{title}</p>
      {hint ? (
        <p className="mt-1 text-[13px] text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}
