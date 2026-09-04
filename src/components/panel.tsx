/**
 * A flat white working surface with a ruled header. No radius, no shadow —
 * it reads as a panel in a console, not a card in a feed.
 */
export function Panel({
  title,
  meta,
  children,
  bodyClassName = "",
}: {
  title: string;
  meta?: React.ReactNode;
  children: React.ReactNode;
  bodyClassName?: string;
}) {
  return (
    <section className="border border-hairline bg-panel">
      <div className="flex items-center justify-between gap-3 border-b border-hairline bg-panel-alt px-4 py-2.5">
        <h2>{title}</h2>
        {meta ? <div className="text-[12px] text-muted-foreground">{meta}</div> : null}
      </div>
      <div className={bodyClassName}>{children}</div>
    </section>
  );
}
