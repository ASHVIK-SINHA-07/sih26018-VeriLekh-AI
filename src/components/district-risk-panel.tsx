import type { DistrictRisk } from "@/lib/risk";
import { asCount, asPercent } from "@/lib/format";
import { Panel } from "@/components/panel";
import { EmptyState } from "@/components/empty-state";

/**
 * Turns three per-record engines (quality, reconciliation, chain of title)
 * into the one question a supervising officer actually has: given a fixed
 * number of field-verification visits this month, which district gets them
 * first? Every other screen in this system answers "what's wrong with this
 * record" — this is the one that answers "where do we send someone."
 */

function RateCell({
  label, checked, flagged, rate,
}: { label: string; checked: number; flagged: number; rate: number }) {
  if (checked === 0) {
    return (
      <div>
        <p className="text-[12.5px] text-ink-3">{label}</p>
        <p className="text-[12px] text-ink-3">nothing checked yet</p>
      </div>
    );
  }
  return (
    <div>
      <p className="text-[12.5px] text-ink-3">{label}</p>
      <p className={`text-[13px] tabular-nums ${flagged > 0 ? "font-semibold text-status-flagged" : "text-foreground"}`}>
        {asPercent(rate)}
        <span className="text-ink-3"> — {flagged} of {checked}</span>
      </p>
    </div>
  );
}

export function DistrictRiskPanel({ rows }: { rows: DistrictRisk[] }) {
  const totalNeedingVisit = rows.reduce((sum, r) => sum + r.needsFieldVerification, 0);

  return (
    <Panel
      title="Field-verification priority by district"
      meta={
        totalNeedingVisit === 0
          ? "Nothing flagged"
          : `${asCount(totalNeedingVisit)} record${totalNeedingVisit === 1 ? "" : "s"} to send someone to check`
      }
    >
      {rows.length === 0 ? (
        <div className="p-6">
          <EmptyState title="No districts yet" hint="Nothing has been digitised with a district recorded." />
        </div>
      ) : (
        <div className="divide-y divide-hairline">
          {rows.map((r) => (
            <div
              key={r.district}
              className={`flex flex-wrap items-start gap-x-6 gap-y-2 border-l-[3px] px-4 py-3 ${
                r.needsFieldVerification > 0 ? "border-l-status-flagged" : "border-l-status-verified"
              }`}
            >
              <div className="w-[160px] shrink-0">
                <p className="text-[13.5px] font-semibold text-foreground">{r.district}</p>
                <p className="text-[12px] text-ink-3">
                  {r.recordCount} record{r.recordCount === 1 ? "" : "s"} · mean quality {r.meanQuality}
                </p>
              </div>

              <RateCell
                label="Disagrees with another system"
                checked={r.reconciled}
                flagged={r.reconciliationConflicts}
                rate={r.reconciliationConflictRate}
              />

              <RateCell
                label="Title defect (double sale, sale by the deceased, etc.)"
                checked={r.chainsTraced}
                flagged={r.criticalChainDefects}
                rate={r.chainDefectRate}
              />

              <div className="ml-auto text-right">
                <p className="text-[12.5px] text-ink-3">Send someone to check</p>
                <p
                  className={`text-[20px] font-semibold tabular-nums leading-none ${
                    r.needsFieldVerification > 0 ? "text-status-flagged" : "text-status-verified"
                  }`}
                >
                  {r.needsFieldVerification}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}
