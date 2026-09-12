import type { DistrictRisk } from "@/lib/risk";
import { asPercent } from "@/lib/format";
import { getI18n } from "@/i18n/server";
import type { Translator } from "@/i18n/translate";
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
  label, checked, flagged, rate, t,
}: { label: string; checked: number; flagged: number; rate: number; t: Translator }) {
  if (checked === 0) {
    return (
      <div>
        <p className="text-[12.5px] text-ink-3">{label}</p>
        <p className="text-[12px] text-ink-3">{t("risk.nothingChecked")}</p>
      </div>
    );
  }
  return (
    <div>
      <p className="text-[12.5px] text-ink-3">{label}</p>
      <p className={`text-[13px] tabular-nums ${flagged > 0 ? "font-semibold text-status-flagged" : "text-foreground"}`}>
        {asPercent(rate)}
        <span className="text-ink-3"> — {t("risk.rate", { flagged, checked })}</span>
      </p>
    </div>
  );
}

export async function DistrictRiskPanel({ rows }: { rows: DistrictRisk[] }) {
  const { t } = await getI18n();
  const totalNeedingVisit = rows.reduce((sum, r) => sum + r.needsFieldVerification, 0);

  return (
    <Panel
      title={t("risk.title")}
      meta={
        totalNeedingVisit === 0
          ? t("risk.nothingFlagged")
          : t("risk.toCheck", { count: totalNeedingVisit })
      }
    >
      {rows.length === 0 ? (
        <div className="p-6">
          <EmptyState title={t("risk.emptyTitle")} hint={t("risk.emptyHint")} />
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
                  {t("risk.records", { count: r.recordCount, quality: r.meanQuality })}
                </p>
              </div>

              <RateCell
                label={t("risk.disagrees")}
                t={t}
                checked={r.reconciled}
                flagged={r.reconciliationConflicts}
                rate={r.reconciliationConflictRate}
              />

              <RateCell
                label={t("risk.titleDefect")}
                t={t}
                checked={r.chainsTraced}
                flagged={r.criticalChainDefects}
                rate={r.chainDefectRate}
              />

              <div className="ml-auto text-right">
                <p className="text-[12.5px] text-ink-3">{t("risk.sendSomeone")}</p>
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
