import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { fromJson } from "@/lib/json";
import { getDashboardStats } from "@/lib/stats";
import { ScreenHeader } from "@/components/screen-header";
import { StatCard } from "@/components/stat-card";
import { Panel } from "@/components/panel";
import { EmptyState } from "@/components/empty-state";
import { asCount, asPercent } from "@/lib/format";
import type {
  ConfidenceMap, ExtractedFields, ValidationIssue,
} from "@/types";
import { TrendChart } from "./trend-chart";
import { DistrictFilter } from "./district-filter";
import { ActivityTable, type ActivityRow } from "./activity-table";

export const metadata = { title: "Dashboard — Land record digitization" };
export const dynamic = "force-dynamic";

/** Screen 4 in docs/04_Frontend_Spec.md. Open to all three roles. */
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
      take: 12,
      include: { record: true, validation: true },
    }),
  ]);

  const rows: ActivityRow[] = recent.map((row) => ({
    id: row.id,
    filename: row.filename,
    status: row.status,
    village: row.record?.village ?? null,
    district: row.record?.district ?? null,
    ulpin: row.record?.ulpin ?? null,
    updatedAt: row.updatedAt.toISOString(),
    fields: row.record
      ? ({
          ownerName: row.record.ownerName, surveyNumber: row.record.surveyNumber,
          khasraNumber: row.record.khasraNumber, khataNumber: row.record.khataNumber,
          plotArea: row.record.plotArea, village: row.record.village,
          tehsil: row.record.tehsil, district: row.record.district,
          landClassification: row.record.landClassification, ulpin: row.record.ulpin,
        } satisfies ExtractedFields)
      : null,
    confidence: fromJson<ConfidenceMap>(row.record?.confidence, {}),
    issues: fromJson<ValidationIssue[]>(row.validation?.issues, []),
  }));

  return (
    <>
      <ScreenHeader
        title="Dashboard"
        subtitle={
          (district
            ? `Showing ${district} only.`
            : "Digitization progress across all districts.") +
          (readOnly ? " Read-only access." : "")
        }
      >
        <DistrictFilter districts={stats.byDistrict} />
      </ScreenHeader>

      <div className="space-y-5 p-7">
        {/* KPI strip */}
        <div className="flex flex-wrap divide-x divide-hairline border border-hairline bg-panel">
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

        <Panel
          title="Documents processed over time"
          meta="Last 14 days"
          bodyClassName="px-4 pt-4 pb-2"
        >
          <TrendChart data={stats.trend} />
        </Panel>

        <Panel
          title="Recent activity"
          meta={`${rows.length} most recent · select a row for detail`}
        >
          {rows.length === 0 ? (
            <div className="p-6">
              <EmptyState
                title="No records yet"
                hint={district ? `Nothing recorded for ${district}.` : "Upload a scanned record to begin."}
              />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <ActivityTable rows={rows} readOnly={readOnly} />
            </div>
          )}
        </Panel>
      </div>
    </>
  );
}
