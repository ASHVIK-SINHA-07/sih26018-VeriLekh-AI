import Link from "next/link";
import type { ChainAnalysis, ChainFinding } from "@/lib/chain";
import { getI18n } from "@/i18n/server";
import { formatDate, renderFinding } from "@/i18n/translate";

/**
 * Chain of title — how this parcel came to be owned by whoever owns it now.
 *
 * The khatauni on the left of the screen says who owns the land today. This
 * replays the mutation register behind it, entry by entry, and marks the entry
 * where the history stops adding up. A defect is shown on the entry it
 * concerns rather than in a list at the bottom, because "which transaction is
 * wrong" is the question the reviewer actually has to answer.
 */

/** Stands in for the struck-through share inside a translated sentence. */
const MARK = "\u0001";

function FindingLine({ text, critical }: { text: string; critical: boolean }) {
  return (
    <p className={`mt-1 text-[14px] leading-snug ${critical ? "text-status-flagged" : "text-low-confidence"}`}>
      {critical ? "✕ " : "! "}
      {text}
    </p>
  );
}

export async function ChainPanel({
  chain, khasra, title: titleProp, note, highlightId, currentDocumentId,
}: {
  chain: ChainAnalysis;
  khasra: string | null;
  title?: string;
  /** One line under the heading — e.g. that this is a preview. */
  note?: string;
  /** An entry to mark — the order under review, proposed or just entered. */
  highlightId?: string | null;
  /** The document on screen, so its own entry is not linked to itself. */
  currentDocumentId?: string;
}) {
  const { t, locale } = await getI18n();
  const title = titleProp ?? t("chain.title");
  const d = (date: Date) => formatDate(locale, date);
  const line = (f: ChainFinding, key: number) => (
    <FindingLine key={key} text={renderFinding(t, locale, f)} critical={f.severity === "critical"} />
  );

  if (chain.status === "EMPTY") {
    return (
      <div className="border border-hairline border-l-[3px] border-l-hairline-2 bg-panel">
        <div className="border-b border-hairline px-4 py-3">
          <p className="text-[15px] font-semibold text-foreground">{title}</p>
        </div>
        <p className="px-4 py-3 text-[14px] text-ink-2">
          {khasra ? t("chain.empty", { khasra }) : t("chain.emptyNoKhasra")}
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
        <p className="text-[15px] font-semibold text-foreground">
          {title}
          {chain.span ? (
            <span className="font-normal text-ink-2">
              {" "}— {t("chain.span", {
                from: chain.span.from.getUTCFullYear(),
                to: chain.span.to.getUTCFullYear(),
                count: chain.steps.length,
              })}
            </span>
          ) : null}
        </p>
        <p
          className={`text-[12px] font-semibold uppercase tracking-[0.08em] ${
            !defective ? "text-status-verified" : critical > 0 ? "text-status-flagged" : "text-low-confidence"
          }`}
        >
          {!defective
            ? t("chain.unbroken")
            : critical > 0
              ? t("chain.breaks", { count: critical })
              : t("chain.needsLook")}
        </p>
      </div>

      {note ? (
        <p className="border-b border-hairline bg-panel-alt px-4 py-2 text-[13px] text-ink-2">{note}</p>
      ) : null}

      <ol className="px-4 py-2">
        {steps.map(({ mutation: m, applied }) => {
          const findings = byEntry.get(m.seq) ?? [];
          const bad = findings.some((f) => f.severity === "critical");
          const replaced = m.supersedesId ? correctionOf.get(m.supersedesId) : undefined;
          return (
            <li
              key={m.id}
              className={`relative flex gap-3 border-b border-hairline py-2.5 last:border-b-0 ${
                m.id === highlightId ? "-mx-4 border-l-[3px] border-l-navy bg-navy/[0.04] px-4" : ""
              }`}
            >
              <div className="w-[92px] shrink-0 pt-px text-[13px] tabular-nums text-ink-3">{d(m.effectiveDate)}</div>
              <div className="min-w-0 flex-1">
                <p className={`text-[14.5px] ${bad ? "text-status-flagged" : "text-foreground"}`}>
                  <span className="font-semibold">{t(`mutationTypes.${m.type}`)}</span>
                  {m.fromOwner ? <> · {m.fromOwner} → </> : <> · </>}
                  <span className="font-medium">{m.toOwner}</span>
                  <span className="text-ink-2"> · {m.share === "1" ? t("chain.wholeParcel") : t("chain.shareOf", { share: m.share })}</span>
                  {!applied ? <span className="text-status-flagged"> · {t("chain.notApplied")}</span> : null}
                </p>
                <p className="mt-0.5 text-[12.5px] text-ink-3">
                  {m.mutationNumber ? t("chain.mutationNumber", { number: m.mutationNumber }) : t("chain.noNumber")}
                  {` · ${t("chain.entry", { seq: m.seq })}`}
                  {` · ${t("chain.digitised", { date: d(m.recordedAt) })}`}
                  {m.id === highlightId ? <span className="font-semibold text-navy"> · {t("chain.thisOrder")}</span> : null}
                  {m.sourceDocumentId && m.sourceDocumentId !== currentDocumentId ? (
                    <>
                      {" · "}
                      <Link href={`/verify/${m.sourceDocumentId}`} className="text-navy underline underline-offset-2">
                        {t("chain.readFromScan")}
                      </Link>
                    </>
                  ) : null}
                </p>
                {replaced ? (() => {
                  // The old share is struck through wherever the language
                  // puts it in the sentence.
                  const [before, after = ""] = t("chain.corrected", { old: MARK, date: d(replaced.recordedAt) }).split(MARK);
                  return (
                    <p className="mt-1 text-[12.5px] text-ink-2">
                      {before}
                      <span className="line-through">{t("chain.shareOf", { share: replaced.share })}</span>
                      {after}
                    </p>
                  );
                })() : null}
                {findings.map(line)}
              </div>
            </li>
          );
        })}
      </ol>

      {wholeChain.length > 0 ? (
        <div className="border-t border-hairline px-4 py-2.5">
          {wholeChain.map(line)}
        </div>
      ) : null}

      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 border-t border-hairline px-4 py-3">
        <span className="text-[12px] font-semibold uppercase tracking-[0.09em] text-ink-3">{t("chain.holdsToday")}</span>
        <span className="text-[14px] text-foreground">
          {chain.currentHolders.length === 0
            ? t("chain.holdsNobody")
            : chain.currentHolders.map((h) => `${h.owner} (${h.share === "1" ? t("chain.whole") : h.share})`).join(" · ")}
        </span>
        <span className="text-[12.5px] text-ink-3">· {t("chain.synthetic")}</span>
      </div>
    </div>
  );
}
