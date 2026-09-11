import { MUTATION_LABELS, type ChainAnalysis, type ChainFinding } from "@/lib/chain";

/**
 * Chain of title — how this parcel came to be owned by whoever owns it now.
 *
 * The khatauni on the left of the screen says who owns the land today. This
 * replays the mutation register behind it, entry by entry, and marks the entry
 * where the history stops adding up. A defect is shown on the entry it
 * concerns rather than in a list at the bottom, because "which transaction is
 * wrong" is the question the reviewer actually has to answer.
 */

const DATE = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const d = (date: Date) => DATE.format(date);

function FindingLine({ f }: { f: ChainFinding }) {
  return (
    <p className={`mt-1 text-[12.5px] leading-snug ${f.severity === "critical" ? "text-status-flagged" : "text-low-confidence"}`}>
      {f.severity === "critical" ? "✕ " : "! "}
      {f.message}
    </p>
  );
}

export function ChainPanel({ chain, khasra }: { chain: ChainAnalysis; khasra: string | null }) {
  if (chain.status === "EMPTY") {
    return (
      <div className="border border-hairline border-l-[3px] border-l-hairline-2 bg-panel">
        <div className="border-b border-hairline px-4 py-3">
          <p className="text-[13.5px] font-semibold text-foreground">Chain of title</p>
        </div>
        <p className="px-4 py-3 text-[12.5px] text-ink-2">
          No mutation history has been digitised for {khasra ? `khasra ${khasra}` : "this parcel"} yet.
          Ownership can only be traced once its entries in the mutation register are read in.
        </p>
      </div>
    );
  }

  const defective = chain.status === "DEFECTS";
  const critical = chain.findings.filter((f) => f.severity === "critical").length;
  const byEntry = new Map<number, ChainFinding[]>();
  for (const f of chain.findings) {
    if (f.seq === undefined) continue;
    byEntry.set(f.seq, [...(byEntry.get(f.seq) ?? []), f]);
  }
  const wholeChain = chain.findings.filter((f) => f.seq === undefined);

  // Shown in the order events happened. Heirs of one inheritance share a date.
  const steps = [...chain.steps].sort(
    (a, b) => a.mutation.effectiveDate.getTime() - b.mutation.effectiveDate.getTime() || a.mutation.seq - b.mutation.seq,
  );
  const correctionOf = new Map(
    chain.superseded.map((old) => [old.id, old]),
  );

  return (
    <div
      className={`border border-hairline border-l-[3px] bg-panel ${
        !defective ? "border-l-status-verified" : critical > 0 ? "border-l-status-flagged" : "border-l-low-confidence"
      }`}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-hairline px-4 py-3">
        <p className="text-[13.5px] font-semibold text-foreground">
          Chain of title
          {chain.span ? (
            <span className="font-normal text-ink-2">
              {" "}— {chain.span.from.getUTCFullYear()} to {chain.span.to.getUTCFullYear()}, {chain.steps.length}{" "}
              {chain.steps.length === 1 ? "entry" : "entries"}
            </span>
          ) : null}
        </p>
        <p
          className={`text-[11px] font-semibold uppercase tracking-[0.08em] ${
            !defective ? "text-status-verified" : critical > 0 ? "text-status-flagged" : "text-low-confidence"
          }`}
        >
          {!defective
            ? "Unbroken"
            : critical > 0
              ? `${critical} ${critical === 1 ? "break" : "breaks"} in the chain`
              : "Needs a look"}
        </p>
      </div>

      <ol className="px-4 py-2">
        {steps.map(({ mutation: m, applied }) => {
          const findings = byEntry.get(m.seq) ?? [];
          const bad = findings.some((f) => f.severity === "critical");
          const replaced = m.supersedesId ? correctionOf.get(m.supersedesId) : undefined;
          return (
            <li key={m.id} className="relative flex gap-3 border-b border-hairline py-2.5 last:border-b-0">
              <div className="w-[92px] shrink-0 pt-px text-[12px] tabular-nums text-ink-3">{d(m.effectiveDate)}</div>
              <div className="min-w-0 flex-1">
                <p className={`text-[13px] ${bad ? "text-status-flagged" : "text-foreground"}`}>
                  <span className="font-semibold">{MUTATION_LABELS[m.type]}</span>
                  {m.fromOwner ? <> · {m.fromOwner} → </> : <> · </>}
                  <span className="font-medium">{m.toOwner}</span>
                  <span className="text-ink-2"> · {m.share === "1" ? "whole parcel" : `${m.share} share`}</span>
                  {!applied ? <span className="text-status-flagged"> · not applied</span> : null}
                </p>
                <p className="mt-0.5 text-[11.5px] text-ink-3">
                  {m.mutationNumber ? `Mutation ${m.mutationNumber}` : "No mutation number"}
                  {` · entry ${m.seq}`}
                  {` · digitised ${d(m.recordedAt)}`}
                </p>
                {replaced ? (
                  <p className="mt-1 text-[11.5px] text-ink-2">
                    Corrected — first read as{" "}
                    <span className="line-through">{replaced.share} share</span> on {d(replaced.recordedAt)}; the earlier
                    reading is kept in the register, not overwritten.
                  </p>
                ) : null}
                {findings.map((f, i) => <FindingLine key={i} f={f} />)}
              </div>
            </li>
          );
        })}
      </ol>

      {wholeChain.length > 0 ? (
        <div className="border-t border-hairline px-4 py-2.5">
          {wholeChain.map((f, i) => <FindingLine key={i} f={f} />)}
        </div>
      ) : null}

      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 border-t border-hairline px-4 py-3">
        <span className="text-[11px] font-semibold uppercase tracking-[0.09em] text-ink-3">Holds today</span>
        <span className="text-[12.5px] text-foreground">
          {chain.currentHolders.length === 0
            ? "nobody — the chain does not resolve to an owner"
            : chain.currentHolders.map((h) => `${h.owner} (${h.share === "1" ? "whole" : h.share})`).join(" · ")}
        </span>
        <span className="text-[11.5px] text-ink-3">· demo chains are synthetic</span>
      </div>
    </div>
  );
}
