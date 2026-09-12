import type { QualityScore, Deduction } from "@/lib/quality";
import type { ChainVerdict } from "@/lib/provenance";
import { getI18n } from "@/i18n/server";
import { renderFinding, type Translator } from "@/i18n/translate";
import type { Locale } from "@/i18n/config";

/**
 * The record's data quality score, and whether its provenance chain still
 * verifies.
 *
 * Both are shown with their working. A score a reviewer cannot interrogate is
 * a score they learn to ignore, so every component carries its own figure and
 * every deduction is named.
 */

const BAND_STYLE: Record<QualityScore["band"], { ring: string; text: string }> = {
  HIGH:   { ring: "border-l-status-verified", text: "text-status-verified" },
  MEDIUM: { ring: "border-l-low-confidence",  text: "text-low-confidence" },
  LOW:    { ring: "border-l-status-flagged",  text: "text-status-flagged" },
};

const DETAIL_KEY = {
  completeness: "quality.detailCompleteness",
  confidence: "quality.detailConfidence",
  confidenceNone: "quality.detailConfidenceNone",
  consistency: "quality.detailConsistency",
  consistencyNone: "quality.detailConsistencyNone",
} as const;

function deductionText(t: Translator, locale: Locale, d: Deduction): string {
  if (d.kind === "issue") return renderFinding(t, locale, d.issue);
  const fields = d.fields.map((f) => t(`fields.${f}` as Parameters<Translator>[0])).join(", ");
  return t(d.kind === "missingFields" ? "quality.dedMissing" : "quality.dedLow", { count: d.fields.length, fields });
}

function Bar({ value }: { value: number }) {
  return (
    <div className="mt-1 h-1 w-full bg-hairline" aria-hidden="true">
      <div className="h-full bg-navy" style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
    </div>
  );
}

export async function QualityPanel({
  quality,
  chain,
}: {
  quality: QualityScore;
  chain: ChainVerdict;
}) {
  const { t, locale } = await getI18n();
  const style = BAND_STYLE[quality.band];
  const components = [
    { name: t("quality.completeness"), ...quality.components.completeness },
    { name: t("quality.confidence"), ...quality.components.confidence },
    { name: t("quality.consistency"), ...quality.components.consistency },
  ];

  return (
    <div data-tour="review-quality" className={`border border-hairline border-l-[3px] ${style.ring} bg-panel`}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-hairline px-4 py-3">
        <p className="text-[13.5px] font-semibold text-foreground">{t("quality.title")}</p>
        <p className="text-[12.5px] text-ink-2">{t("quality.weights")}</p>
      </div>

      <div className="flex flex-col gap-5 px-4 py-4 sm:flex-row sm:items-start">
        <div className="flex items-baseline gap-2 sm:w-[132px] sm:shrink-0 sm:flex-col sm:items-start sm:gap-0">
          <span className={`text-[40px] font-semibold leading-none tabular-nums ${style.text}`}>
            {quality.score}
          </span>
          <span className={`text-[12px] font-semibold uppercase tracking-[0.08em] ${style.text}`}>
            {t(`quality.${quality.band}`)}
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
              <p className="mt-1.5 text-[11.5px] leading-snug text-ink-2">{t(DETAIL_KEY[c.detailCode], c.detailParams)}</p>
            </div>
          ))}
        </div>
      </div>

      {quality.deductionItems.length > 0 ? (
        <div className="border-t border-hairline px-4 py-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.09em] text-ink-3">
            {t("quality.deductionsTitle")}
          </p>
          <ul className="mt-1.5 space-y-1">
            {quality.deductionItems.map((d, i) => (
              <li key={i} className="text-[12.5px] text-ink-2">· {deductionText(t, locale, d)}</li>
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
export async function ProvenanceNote({ chain, framed = false }: { chain: ChainVerdict; framed?: boolean }) {
  const { t } = await getI18n();
  return (
    <div className={`flex flex-wrap items-baseline gap-x-2 gap-y-1 px-4 py-3 ${framed ? "border border-hairline bg-panel" : "border-t border-hairline"}`}>
      <span className="text-[11px] font-semibold uppercase tracking-[0.09em] text-ink-3">
        {t("provenance.label")}
      </span>
      {chain.intact ? (
        <span className="text-[12.5px] text-ink-2">
          <span className="font-semibold text-status-verified">{t("provenance.verified")}</span>
          {" — "}
          {chain.entries === 1 ? t("provenance.one") : t("provenance.many", { count: chain.entries })}
        </span>
      ) : (
        <span className="text-[12.5px] text-ink-2">
          <span className="font-semibold text-status-flagged">{t("provenance.broken")}</span>
          {" — "}
          {t("provenance.brokenAt", { at: chain.brokenAtSeq + 1, count: chain.entries })}{" "}
          {t(`provenance.${chain.reasonCode}`)}
        </span>
      )}
    </div>
  );
}
