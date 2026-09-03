import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { StatusBadge } from "@/components/status-badge";
import { EmptyState } from "@/components/empty-state";
import { asRelativeTime } from "@/lib/format";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { REVIEWABLE_STATUSES } from "@/types";

export const metadata = { title: "Verification — Land record digitization" };
export const dynamic = "force-dynamic";

/**
 * Screen 3 (queue) in docs/04_Frontend_Spec.md.
 * Everything awaiting a human: extracted cleanly (PENDING) or with a problem
 * found (FLAGGED). Flagged first — those need the most attention.
 */
export default async function VerifyQueuePage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (session.user.role === "VIEWER") redirect("/dashboard");

  const rows = await db.document.findMany({
    where: { status: { in: REVIEWABLE_STATUSES } },
    include: {
      record: { select: { district: true, village: true } },
      validation: { select: { status: true } },
    },
    orderBy: [{ status: "asc" }, { updatedAt: "desc" }],
  });

  const flaggedCount = rows.filter((row) => row.status === "FLAGGED").length;

  return (
    <section className="space-y-6">
      <header>
        <h1 className="text-xl font-medium text-navy">Verification queue</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {rows.length === 0
            ? "Nothing is waiting for review."
            : `${rows.length} record${rows.length === 1 ? "" : "s"} awaiting review — ${flaggedCount} with problems found.`}
        </p>
      </header>

      {rows.length === 0 ? (
        <EmptyState
          title="Nothing to review"
          hint="Records appear here once they have been uploaded and read."
        />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border bg-white">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Document</TableHead>
                <TableHead>Village</TableHead>
                <TableHead>District</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Updated</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.id} className="hover:bg-surface">
                  <TableCell className="font-medium">
                    <Link
                      href={`/verify/${row.id}`}
                      className="text-navy underline-offset-2 hover:underline"
                    >
                      {row.filename}
                    </Link>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {row.record?.village ?? "—"}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {row.record?.district ?? "—"}
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={row.status} />
                  </TableCell>
                  <TableCell className="text-right text-xs text-muted-foreground">
                    {asRelativeTime(row.updatedAt)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </section>
  );
}
