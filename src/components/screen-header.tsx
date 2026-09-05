/**
 * The band at the top of every screen: title, one line of context, and any
 * screen-level control on the right. Sits on the panel colour so it reads as
 * a header bar rather than floating on the ground.
 */
export function ScreenHeader({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children?: React.ReactNode;
}) {
  return (
    <header className="border-b border-hairline bg-panel px-4 py-4 sm:px-7 sm:py-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1>{title}</h1>
          {subtitle ? (
            <p className="mt-1 text-[13px] text-muted-foreground">{subtitle}</p>
          ) : null}
        </div>
        {children}
      </div>
    </header>
  );
}
