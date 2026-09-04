import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { fromJson } from "@/lib/json";
import { ScreenHeader } from "@/components/screen-header";
import { REVIEWABLE_STATUSES, type ValidationIssue } from "@/types";
import { QueueTable, type QueueRow } from "./queue-table";

export const metadata = { title: "Verification — Land record digitization" };
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
      validation: { select: { issues: true } },
    },
    orderBy: [{ status: "asc" }, { updatedAt: "desc" }],
  });

  const rows: QueueRow[] = documents.map((row) => {
    const issues = fromJson<ValidationIssue[]>(row.validation?.issues, []);
    return {
      id: row.id,
      filename: row.filename,
      status: row.status,
      village: row.record?.village ?? null,
      district: row.record?.district ?? null,
      updatedAt: row.updatedAt.toISOString(),
      issueCount: issues.length,
      topIssue: issues[0]?.issue ?? null,
    };
  });

  const flagged = rows.filter((row) => row.status === "FLAGGED").length;

  return (
    <>
      <ScreenHeader
        title="Verification queue"
        subtitle={
          rows.length === 0
            ? "Nothing is waiting for review."
            : `${rows.length} record${rows.length === 1 ? "" : "s"} awaiting review — ${flagged} with problems found.`
        }
      />
      <div className="p-7">
        <QueueTable rows={rows} />
      </div>
    </>
  );
}
