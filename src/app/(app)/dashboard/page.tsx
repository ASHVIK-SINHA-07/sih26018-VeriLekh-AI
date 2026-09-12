import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { fromJson } from "@/lib/json";
import { getDashboardStats } from "@/lib/stats";
import { learningStats } from "@/lib/learning";
import { getDistrictRisk } from "@/lib/district-risk";
import { ScreenHeader } from "@/components/screen-header";
import { StatCard } from "@/components/stat-card";
import { Panel } from "@/components/panel";
import { EmptyState } from "@/components/empty-state";
import { DistrictRiskPanel } from "@/components/district-risk-panel";
import { DistrictMap } from "@/components/district-map";
import { getI18n } from "@/i18n/server";
import { formatCount, formatDate, relativeTime, renderFinding } from "@/i18n/translate";
import type { Metadata } from "next";
import type {
  ConfidenceMap, ExtractedFields, ValidationIssue,
} from "@/types";
import { TrendChart } from "./trend-chart";
import { DistrictFilter } from "./district-filter";
import { ActivityTable, type ActivityRow } from "./activity-table";
import { Tour } from "@/components/tour";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t("dashboard.metaTitle") };
}
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
  const { t, locale } = await getI18n();
  const asCount = (n: number) => formatCount(locale, n);
  const readOnly = session.user.role === "VIEWER";

  const [stats, learning, districtRisk, recent, unfilteredRisk] = await Promise.all([
    getDashboardStats(district),
    // Not filtered by district: what the recogniser has been taught applies
    // to every page it reads afterwards, wherever that page came from.
    learningStats(),
    getDistrictRisk(district),
    db.document.findMany({
      where: district ? { record: { district } } : {},
      orderBy: { updatedAt: "desc" },
      take: 12,
      include: { record: true, validation: true, mutation: { select: { village: true, district: true } } },
    }),
    // The map always shows every district, so a filtered dashboard can be
    // widened again from it.
    district ? getDistrictRisk() : Promise.resolve(null),
  ]);

  const rows: ActivityRow[] = recent.map((row) => ({
    id: row.id,
    filename: row.filename,
    status: row.status,
    village: row.record?.village ?? row.mutation?.village ?? null,
    district: row.record?.district ?? row.mutation?.district ?? null,
    ulpin: row.record?.ulpin ?? null,
    updatedLabel: relativeTime(locale, row.updatedAt),
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
    issueTexts: fromJson<ValidationIssue[]>(row.validation?.issues, []).map((issue) =>
      renderFinding(t, locale, issue),
    ),
  }));

  return (
    <>
      <ScreenHeader
        title={t("dashboard.title")}
        subtitle={[
          district ? t("dashboard.showingOnly", { district }) : t("dashboard.allDistricts"),
          readOnly ? t("dashboard.readOnly") : "",
        ].filter(Boolean).join(" ")}
      >
        <DistrictFilter districts={stats.byDistrict} />
      </ScreenHeader>

      <div className="space-y-5 p-4 sm:p-7">
        {/* KPI strip */}
        <div data-tour="dash-stats" className="grid grid-cols-1 divide-y divide-hairline border border-hairline bg-panel sm:grid-cols-2 sm:divide-y-0 lg:grid-cols-4 sm:[&>*:nth-child(n+2)]:border-l sm:[&>*]:border-hairline lg:divide-x">
          <StatCard
            label={t("dashboard.processed")}
            value={asCount(stats.totalProcessed)}
            hint={t("dashboard.processedHint")}
          />
          <StatCard
            label={t("dashboard.quality")}
            value={asCount(stats.avgQuality)}
            hint={
              stats.lowQuality === 0
                ? t("dashboard.qualityHint")
                : t("dashboard.qualityLow", { count: stats.lowQuality })
            }
          />
          <StatCard
            label={t("dashboard.pending")}
            value={asCount(stats.pendingVerification)}
            hint={t("dashboard.pendingHint")}
            tone="pending"
          />
          <StatCard
            label={t("dashboard.flagged")}
            value={asCount(stats.flagged)}
            hint={t("dashboard.flaggedHint")}
            tone="flagged"
          />
        </div>

        {/* What officers have taught the recogniser. Shown as a sentence
            rather than another tile — the point is the trajectory, not the
            figure, and a fifth big number would flatten the strip above. */}
        {learning.distinctCorrections > 0 ? (
          <div className="border border-hairline bg-panel px-4 py-3 sm:px-5">
            {/* Two labelled figures rather than one sentence with two numbers
                in it: the sentence needs different grammar for every count in
                every language, and the figures do not. */}
            <p className="text-[15px] text-foreground">
              <span className="font-semibold">{t("dashboard.learningTitle")}</span>{" "}
              {t("dashboard.learningCorrected")}{" "}
              <span className="font-semibold tabular-nums">{asCount(learning.distinctCorrections)}</span>
              {" · "}
              {t("dashboard.learningApplied")}{" "}
              <span className="font-semibold tabular-nums">{asCount(learning.timesApplied)}</span>
            </p>
            <p className="mt-1 text-[14px] text-ink-2">{t("dashboard.learningNote")}</p>
          </div>
        ) : null}

        <Panel
          title={t("dashboard.trendTitle")}
          meta={t("dashboard.trendMeta")}
          bodyClassName="px-4 pt-4 pb-2"
        >
          <TrendChart data={stats.trend.map((point) => ({ ...point, label: formatDate(locale, point.date, "short") }))} />
        </Panel>

        <DistrictMap
          districts={(unfilteredRisk ?? districtRisk).map((d) => ({
            district: d.district,
            records: d.recordCount,
            needVisit: d.needsFieldVerification,
          }))}
          selected={district}
        />

        <DistrictRiskPanel rows={districtRisk} />

        <Panel
          tour="dash-activity"
          title={t("dashboard.recentTitle")}
          meta={t("dashboard.recentMeta", { count: rows.length })}
        >
          {rows.length === 0 ? (
            <div className="p-6">
              <EmptyState
                title={t("dashboard.emptyTitle")}
                hint={district ? t("dashboard.emptyForDistrict", { district }) : t("dashboard.emptyHint")}
              />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <ActivityTable rows={rows} readOnly={readOnly} />
            </div>
          )}
        </Panel>
      </div>
      <Tour screen="dashboard" />
    </>
  );
}
