import type { QualityScore } from "@/lib/quality";
import type { ChainVerdict } from "@/lib/provenance";

/**
 * The record's data quality score, and whether its provenance chain still
 * verifies.
 *
 * Both are shown with their working. A score a reviewer cannot interrogate is
 * a score they learn to ignore, so every component carries its own figure and
 * every deduction is named.
 */

const BAND_STYLE: Record<QualityScore["band"], { ring: string; text: string; label: string }> = {
  HIGH:   { ring: "border-l-status-verified", text: "text-status-verified", label: "Good" },
  MEDIUM: { ring: "border-l-low-confidence",  text: "text-low-confidence",  label: "Needs review" },
  LOW:    { ring: "border-l-status-flagged",  text: "text-status-flagged",  label: "Poor" },
};

function Bar({ value }: { value: number }) {
  return (
    <div className="mt-1 h-1 w-full bg-hairline" aria-hidden="true">
      <div className="h-full bg-navy" style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
    </div>
  );
}

export function QualityPanel({
  quality,
  chain,
}: {
  quality: QualityScore;
  chain: ChainVerdict;
}) {
  const style = BAND_STYLE[quality.band];
  const components = [
    { name: "Completeness", ...quality.components.completeness },
    { name: "Confidence", ...quality.components.confidence },
    { name: "Consistency", ...quality.components.consistency },
  ];

  return (
    <div className={`border border-hairline border-l-[3px] ${style.ring} bg-panel`}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-hairline px-4 py-3">
        <p className="text-[13.5px] font-semibold text-foreground">Data quality score</p>
        <p className="text-[12.5px] text-ink-2">
          Completeness, confidence and consistency — weighted 30 / 30 / 40
        </p>
      </div>

      <div className="flex flex-col gap-5 px-4 py-4 sm:flex-row sm:items-start">
        <div className="flex items-baseline gap-2 sm:w-[132px] sm:shrink-0 sm:flex-col sm:items-start sm:gap-0">
          <span className={`text-[40px] font-semibold leading-none tabular-nums ${style.text}`}>
            {quality.score}
          </span>
          <span className={`text-[12px] font-semibold uppercase tracking-[0.08em] ${style.text}`}>
            {style.label}
          </span>
        </div>

        <div className="grid flex-1 gap-3 sm:grid-cols-3">
          {components.map((c) => (
            <div key={c.name}>
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-[12.5px] font-medium text-foreground">{c.name}</span>
                <span className="text-[12.5px] tabular-nums text-ink-2">{c.score}</span>
              </div>
              <Bar value={c.score} />
              <p className="mt-1.5 text-[11.5px] leading-snug text-ink-2">{c.detail}</p>
            </div>
          ))}
        </div>
      </div>

      {quality.deductions.length > 0 ? (
        <div className="border-t border-hairline px-4 py-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.09em] text-ink-3">
            What cost this record points
          </p>
          <ul className="mt-1.5 space-y-1">
            {quality.deductions.map((d, i) => (
              <li key={i} className="text-[12.5px] text-ink-2">· {d}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <ProvenanceNote chain={chain} />
    </div>
  );
}

/**
 * Whether this document's audit trail still verifies. The chain is the reason
 * the audit trail is evidence rather than a claim, so its state belongs on
 * screen, not in a log.
 */
export function ProvenanceNote({ chain, framed = false }: { chain: ChainVerdict; framed?: boolean }) {
  return (
    <div className={`flex flex-wrap items-baseline gap-x-2 gap-y-1 px-4 py-3 ${framed ? "border border-hairline bg-panel" : "border-t border-hairline"}`}>
      <span className="text-[11px] font-semibold uppercase tracking-[0.09em] text-ink-3">
        Provenance
      </span>
      {chain.intact ? (
        <span className="text-[12.5px] text-ink-2">
          <span className="font-semibold text-status-verified">Chain verified</span>
          {" — "}
          {chain.entries === 1
            ? "1 audit entry, hash-sealed. Altering it, or inserting an entry after it, would break the chain."
            : `${chain.entries} audit entries, each hash-linked to the one before it. Altering or removing any of them would break the chain.`}
        </span>
      ) : (
        <span className="text-[12.5px] text-ink-2">
          <span className="font-semibold text-status-flagged">Chain broken</span>
          {" — "}
          at entry {chain.brokenAtSeq + 1} of {chain.entries}. {chain.reason}
        </span>
      )}
    </div>
  );
}
