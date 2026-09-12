import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { fromJson } from "@/lib/json";
import { getI18n } from "@/i18n/server";
import { relativeTime, renderFinding } from "@/i18n/translate";
import type { ValidationIssue } from "@/types";

/**
 * GET /api/notifications — what is waiting for the signed-in person.
 *
 * Worked out from the records themselves on every request, not from a store
 * of messages, so it can never disagree with the queue: a mutation order
 * awaiting a decision, and a Record of Rights with problems found. A Viewer
 * can act on neither, so gets nothing.
 *
 * Sentences and times are written here, in the reader's language — the
 * browser may lack the locale data to write them itself (D68).
 */

export const dynamic = "force-dynamic";

export interface NoticeItem {
  id: string;
  kind: "order" | "flagged";
  filename: string;
  place: string;
  finding: string | null;
  updatedAt: string;
  when: string;
}

/** Enough to act on; the queue holds the rest. */
const LIMIT = 30;

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }
  if (session.user.role === "VIEWER") {
    return NextResponse.json({ items: [] }, { headers: { "Cache-Control": "no-store" } });
  }

  const { t, locale } = await getI18n();
  const rows = await db.document.findMany({
    where: {
      OR: [
        { documentType: "MUTATION_ORDER", status: { in: ["PENDING", "FLAGGED"] } },
        { documentType: "KHATAUNI", status: "FLAGGED" },
      ],
    },
    orderBy: { updatedAt: "desc" },
    take: LIMIT,
    include: {
      record: { select: { village: true, district: true } },
      mutation: { select: { village: true, district: true } },
      validation: { select: { issues: true } },
    },
  });

  const items: NoticeItem[] = rows.map((row) => {
    const issues = fromJson<ValidationIssue[]>(row.validation?.issues, []);
    const place = row.record ?? row.mutation;
    return {
      id: row.id,
      kind: row.documentType === "MUTATION_ORDER" ? "order" : "flagged",
      filename: row.filename,
      place: [place?.village, place?.district].filter(Boolean).join(" · "),
      finding: issues[0] ? renderFinding(t, locale, issues[0]) : null,
      updatedAt: row.updatedAt.toISOString(),
      when: relativeTime(locale, row.updatedAt),
    };
  });

  return NextResponse.json({ items }, { headers: { "Cache-Control": "no-store" } });
}
