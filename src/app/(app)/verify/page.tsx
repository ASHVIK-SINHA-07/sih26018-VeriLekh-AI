import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { fromJson } from "@/lib/json";
import { ScreenHeader } from "@/components/screen-header";
import { Tour } from "@/components/tour";
import { REVIEWABLE_STATUSES, type ValidationIssue } from "@/types";
import { QueueTable, type QueueRow } from "./queue-table";
import { getI18n } from "@/i18n/server";
import { relativeTime, renderFinding } from "@/i18n/translate";
import type { Metadata } from "next";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t("queue.metaTitle") };
}
export const dynamic = "force-dynamic";

/**
 * Screen 3 (queue) in docs/04_Frontend_Spec.md.
 * Everything awaiting a person: extracted cleanly (PENDING) or with a problem
 * found (FLAGGED). Flagged first — those need the most attention.
 */
export default async function VerifyQueuePage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (session.user.role === "VIEWER") redirect("/dashboard");

  const documents = await db.document.findMany({
    where: { status: { in: REVIEWABLE_STATUSES } },
    include: {
      record: { select: { district: true, village: true } },
      mutation: { select: { district: true, village: true } },
      validation: { select: { issues: true } },
    },
    orderBy: [{ status: "asc" }, { updatedAt: "desc" }],
  });

  const { t, locale } = await getI18n();
  const rows: QueueRow[] = documents.map((row) => {
    const issues = fromJson<ValidationIssue[]>(row.validation?.issues, []);
    return {
      id: row.id,
      filename: row.filename,
      status: row.status,
      // A mutation order carries its parcel's place on its own reading.
      village: row.record?.village ?? row.mutation?.village ?? null,
      district: row.record?.district ?? row.mutation?.district ?? null,
      updatedLabel: relativeTime(locale, row.updatedAt),
      issueCount: issues.length,
      topIssue: issues[0] ? renderFinding(t, locale, issues[0]) : null,
    };
  });

  const flagged = rows.filter((row) => row.status === "FLAGGED").length;

  return (
    <>
      <ScreenHeader
        title={t("queue.title")}
        subtitle={
          rows.length === 0
            ? t("queue.nothingWaiting")
            : t("queue.summary", { count: rows.length, flagged })
        }
      />
      <div className="p-4 sm:p-7">
        <QueueTable rows={rows} />
        <Tour screen="queue" />
      </div>
    </>
  );
}
