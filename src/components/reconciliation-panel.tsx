import type { ReconciliationSummary, SourceName } from "@/lib/reconcile";
import type { ExtractedFieldName } from "@/types";
import { getI18n } from "@/i18n/server";
import { renderFinding } from "@/i18n/translate";

/**
 * What other government systems say about this parcel.
 *
 * Duplicate detection asks "have we seen this before?". This asks "does the
 * rest of government agree?" — which is the check that catches the errors
 * that actually drive land disputes: a survey that measures the parcel
 * smaller than the revenue record claims, or a registered sale the Record of
 * Rights never caught up with.
 */

const ORDER: SourceName[] = ["ROR", "REGISTRATION", "CADASTRAL"];

function Row({
  label, value, tone,
}: { label: string; value: React.ReactNode; tone?: "conflict" | "muted" }) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 py-1.5">
      <span className="w-[132px] shrink-0 text-[12px] text-ink-3">{label}</span>
      <span
        className={`text-[12.5px] ${
          tone === "conflict" ? "text-status-flagged" : tone === "muted" ? "text-ink-3" : "text-foreground"
        }`}
      >
        {value}
      </span>
    </div>
  );
}

export async function ReconciliationPanel({ result }: { result: ReconciliationSummary }) {
  const { t, locale } = await getI18n();
  const conflicting = result.status === "CONFLICTS";
  const notFound = result.status === "NOT_FOUND";

  const byField = new Map<ExtractedFieldName, typeof result.findings>();
  for (const f of result.conflicts) {
    byField.set(f.field, [...(byField.get(f.field) ?? []), f]);
  }

  return (
    <div
      className={`border border-hairline border-l-[3px] bg-panel ${
        notFound ? "border-l-hairline-2" : conflicting ? "border-l-status-flagged" : "border-l-status-verified"
      }`}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-hairline px-4 py-3">
        <p className="text-[13.5px] font-semibold text-foreground">{t("recon.title")}</p>
        <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-3">{t("recon.simulated")}</p>
      </div>

      <div className="px-4 py-3">
        {notFound ? (
          <p className="text-[12.5px] text-ink-2">{t("recon.notFound")}</p>
        ) : (
          <>
            <div className="flex flex-wrap gap-x-5 gap-y-1.5 pb-2">
              {ORDER.map((source) => {
                const matched = result.matched.includes(source);
                const hasConflict = result.conflicts.some((c) => c.source === source);
                const isStale = result.stale.some((s) => s.source === source);
                return (
                  <span key={source} className="text-[12.5px]">
                    <span className="text-ink-3">{t(`sources.${source}`)}</span>{" "}
                    <span
                      className={
                        !matched
                          ? "text-ink-3"
                          : hasConflict || isStale
                            ? "font-semibold text-status-flagged"
                            : "font-semibold text-status-verified"
                      }
                    >
                      {!matched
                        ? t("recon.notHeld")
                        : hasConflict
                          ? t("recon.conflicts")
                          : isStale
                            ? t("recon.stale")
                            : t("recon.agrees")}
                    </span>
                  </span>
                );
              })}
            </div>

            {result.conflicts.length === 0 && result.stale.length === 0 ? (
              <p className="border-t border-hairline pt-2 text-[12.5px] text-ink-2">{t("recon.allAgree")}</p>
            ) : (
              <div className="divide-y divide-hairline border-t border-hairline">
                {[...byField.entries()].map(([field, findings]) => (
                  <div key={field} className="py-1.5">
                    <Row
                      label={t(`fields.${field}`)}
                      tone="conflict"
                      value={findings.map((f, i) => (
                        <span key={i} className="block">
                          {renderFinding(t, locale, f)}
                        </span>
                      ))}
                    />
                  </div>
                ))}
                {result.stale.map((s) => (
                  <div key={s.source} className="py-1.5">
                    <Row
                      label={t("recon.notUpdated")}
                      tone="conflict"
                      value={t("findings.reconStale", { source: t(`sources.${s.source}`), years: s.years })}
                    />
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
