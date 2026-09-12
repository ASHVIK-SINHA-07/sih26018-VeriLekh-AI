import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { db } from "@/lib/db";
import { verifyDocumentChain } from "@/lib/audit";
import { allow, type RateWindow } from "@/lib/rate-limit";
import type { ChainVerdict } from "@/lib/provenance";
import { LanguageSwitcher } from "@/components/language-switcher";
import { getI18n } from "@/i18n/server";
import { formatDate } from "@/i18n/translate";
import type { DocumentStatus } from "@/types";

/**
 * The public record check — the only screen reachable without signing in.
 *
 * Anyone holding a document can type its reference and learn four things:
 * whether this system holds such a record, whether a revenue officer approved
 * it and when, and whether its audit trail still verifies. Never the owner,
 * the khasra, the area or the village: a land record is personal data, and a
 * page that answered those would be a lookup service for strangers.
 *
 * The same page is the citizen's side of the impostor problem — someone
 * handed a "verified" paper can check it without trusting whoever handed it
 * over.
 */

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  // Kept out of search engines: it answers questions, it does not publish.
  return { title: t("check.metaTitle"), robots: { index: false, follow: false } };
}

/** A ULPIN-style reference: 14 uppercase letters and digits (D15). */
const REFERENCE = /^[A-Z0-9]{14}$/;

/** Twenty checks per ten minutes per connection: plenty for a person. */
const LIMIT = 20;
const WINDOW_MS = 10 * 60 * 1000;
const windows = new Map<string, RateWindow>();

type Result =
  | { kind: "empty" }
  | { kind: "badFormat" }
  | { kind: "tooMany" }
  | { kind: "notFound" }
  | { kind: "found"; status: DocumentStatus; approvedAt: Date | null; chain: ChainVerdict };

async function check(reference: string): Promise<Result> {
  if (!reference) return { kind: "empty" };

  // Behind the proxy the caller is the first address it forwards.
  const forwarded = (await headers()).get("x-forwarded-for");
  const caller = forwarded?.split(",")[0]?.trim() || "direct";
  if (!allow(windows, caller, LIMIT, WINDOW_MS)) return { kind: "tooMany" };

  if (!REFERENCE.test(reference)) return { kind: "badFormat" };

  const record = await db.extractedRecord.findUnique({
    where: { ulpin: reference },
    select: { documentId: true, document: { select: { status: true } } },
  });
  if (!record) return { kind: "notFound" };

  const approval = await db.auditLog.findFirst({
    where: { documentId: record.documentId, action: "APPROVE" },
    orderBy: { timestamp: "desc" },
    select: { timestamp: true },
  });

  return {
    kind: "found",
    status: record.document.status,
    approvedAt: approval?.timestamp ?? null,
    chain: await verifyDocumentChain(record.documentId),
  };
}

export default async function CheckPage({
  searchParams,
}: {
  searchParams: Promise<{ ref?: string }>;
}) {
  const { t, locale } = await getI18n();
  const { ref } = await searchParams;
  const reference = (ref ?? "").replace(/\s+/g, "").toUpperCase();
  const result = await check(reference);

  const verified = result.kind === "found" && result.status === "VERIFIED";
  const stripe =
    result.kind !== "found"
      ? "border-l-low-confidence"
      : verified && result.chain.intact
        ? "border-l-status-verified"
        : "border-l-status-flagged";

  return (
    <main className="flex min-h-screen items-center justify-center bg-paper p-6">
      <div className="w-full max-w-md space-y-3">
        <div className="border border-hairline bg-field p-6">
          <h1 className="font-serif text-xl font-medium text-navy">{t("check.title")}</h1>
          <div className="mt-2 h-[2px] w-10 bg-terracotta" />
          <p className="mt-3 text-sm text-muted-foreground">{t("check.intro")}</p>

          <form method="get" className="mt-5 space-y-2">
            <label htmlFor="ref" className="block text-sm font-medium">{t("check.label")}</label>
            <div className="flex gap-2">
              <input
                id="ref"
                name="ref"
                defaultValue={reference}
                placeholder={t("check.placeholder")}
                autoComplete="off"
                spellCheck={false}
                maxLength={20}
                className="h-9 min-w-0 flex-1 border border-rule bg-panel px-3 font-mono text-[15.5px] tracking-wide uppercase outline-none focus-visible:border-navy"
              />
              <button
                type="submit"
                className="h-9 bg-navy px-4 text-[15px] font-medium text-white transition-opacity hover:opacity-90"
              >
                {t("check.submit")}
              </button>
            </div>
          </form>

          {result.kind === "empty" ? null : (
            <div role="status" className={`mt-5 border border-l-[3px] border-hairline bg-panel px-4 py-3 ${stripe}`}>
              {result.kind === "badFormat" ? (
                <p className="text-[15px] text-ink-2">{t("check.badFormat")}</p>
              ) : result.kind === "tooMany" ? (
                <p className="text-[15px] text-ink-2">{t("check.tooMany")}</p>
              ) : result.kind === "notFound" ? (
                <p className="text-[15px] text-ink-2">{t("check.notFound")}</p>
              ) : (
                <div className="space-y-1.5">
                  <p className="font-mono text-[13px] text-ink-3">{reference}</p>
                  <p className={`text-[16.5px] font-semibold ${verified ? "text-status-verified" : "text-status-flagged"}`}>
                    {verified ? t("check.verified") : t("check.notVerified")}
                  </p>
                  {verified && result.approvedAt ? (
                    <p className="text-[15px] text-ink-2">
                      {t("check.approvedOn", { date: formatDate(locale, result.approvedAt) })}
                    </p>
                  ) : (
                    <p className="text-[15px] text-ink-2">
                      {t("check.statusNow", { status: t(`status.${result.status}`) })}
                    </p>
                  )}
                  <p className={`text-[15px] ${result.chain.intact ? "text-ink-2" : "font-medium text-status-flagged"}`}>
                    {result.chain.intact
                      ? t("check.chainIntact", { count: result.chain.entries })
                      : t("check.chainBroken")}
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        <p className="text-[13px] text-muted-foreground">{t("check.prototype")}</p>
        <div className="flex items-center justify-between gap-4">
          <Link href="/login" className="text-[14.5px] text-navy underline underline-offset-2">
            {t("check.signIn")}
          </Link>
          <div className="w-56"><LanguageSwitcher tone="paper" /></div>
        </div>
      </div>
    </main>
  );
}
