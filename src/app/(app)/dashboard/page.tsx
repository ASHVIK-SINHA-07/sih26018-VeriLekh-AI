import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { getDashboardStats } from "@/lib/stats";
import { StatCard } from "@/components/stat-card";
import { StatusBadge } from "@/components/status-badge";
import { EmptyState } from "@/components/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { asCount, asPercent, asRelativeTime } from "@/lib/format";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { REVIEWABLE_STATUSES } from "@/types";
import { TrendChart } from "./trend-chart";
import { DistrictFilter } from "./district-filter";

export const metadata = { title: "Dashboard — Land record digitization" };
export const dynamic = "force-dynamic";

/**
 * Screen 4 in docs/04_Frontend_Spec.md. Open to all three roles.
 *
 * A Viewer sees exactly this, with no action that changes anything: rows link
 * to the record but the verify screen itself turns them away.
 */
export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ district?: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const { district } = await searchParams;
  const readOnly = session.user.role === "VIEWER";

  const [stats, recent] = await Promise.all([
    getDashboardStats(district),
    db.document.findMany({
      where: district ? { record: { district } } : {},
      orderBy: { updatedAt: "desc" },
      take: 8,
      include: { record: { select: { district: true, village: true, ulpin: true } } },
    }),
  ]);

  return (
    <section className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-medium text-navy">Dashboard</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {district
              ? `Showing ${district} only.`
              : "Digitization progress across all districts."}
            {readOnly ? " Read-only access." : ""}
          </p>
        </div>
        <Suspense fallback={<Skeleton className="h-8 w-48" />}>
          <DistrictFilter districts={stats.byDistrict} />
        </Suspense>
      </header>

      {/* ------------------------------------------------------ metric cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Documents processed"
          value={asCount(stats.totalProcessed)}
          hint="Read and checked by the pipeline"
        />
        <StatCard
          label="Extraction accuracy"
          value={asPercent(stats.avgAccuracy)}
          hint="Mean confidence across all fields"
        />
        <StatCard
          label="Pending verification"
          value={asCount(stats.pendingVerification)}
          hint="Extracted cleanly, awaiting sign-off"
          tone="pending"
        />
        <StatCard
          label="Flagged"
          value={asCount(stats.flagged)}
          hint="Problems found — needs correction"
          tone="flagged"
        />
      </div>

      {/* ------------------------------------------------------- trend chart */}
      <div className="rounded-lg border border-border bg-white p-4">
        <h2 className="text-sm font-medium text-navy">
          Documents processed over time
        </h2>
        <p className="mb-2 text-xs text-muted-foreground">Last 14 days</p>
        <TrendChart data={stats.trend} />
      </div>

      {/* ---------------------------------------------------- recent activity */}
      <div className="space-y-3">
        <h2 className="text-sm font-medium text-navy">Recent activity</h2>

        {recent.length === 0 ? (
          <EmptyState
            title="No records yet"
            hint={district ? `Nothing recorded for ${district}.` : "Upload a scanned record to begin."}
          />
        ) : (
          <div className="overflow-x-auto rounded-lg border border-border bg-white">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Document</TableHead>
                  <TableHead>Village</TableHead>
                  <TableHead>District</TableHead>
                  <TableHead>ULPIN</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Updated</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recent.map((row) => {
                  const openable =
                    !readOnly && REVIEWABLE_STATUSES.includes(row.status);
                  return (
                    <TableRow key={row.id} className="hover:bg-surface">
                      <TableCell className="font-medium">
                        {openable ? (
                          <Link
                            href={`/verify/${row.id}`}
                            className="text-navy underline-offset-2 hover:underline"
                          >
                            {row.filename}
                          </Link>
                        ) : (
                          row.filename
                        )}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {row.record?.village ?? "—"}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {row.record?.district ?? "—"}
                      </TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">
                        {row.record?.ulpin ?? "—"}
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={row.status} />
                      </TableCell>
                      <TableCell className="text-right text-xs text-muted-foreground">
                        {asRelativeTime(row.updatedAt)}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </section>
  );
}
