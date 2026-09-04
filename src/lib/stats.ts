import { db } from "@/lib/db";
import type { ConfidenceMap, DashboardStats } from "@/types";

/**
 * Dashboard aggregates — docs/02_Technical_Architecture.md.
 *
 * Computed from the database on every read, so the numbers move the moment a
 * record is approved. Nothing is cached or precomputed: a stale dashboard in
 * front of a judge is worse than a slow one, and at this scale it is neither.
 *
 * Lives here rather than inside the route handler so the dashboard page can
 * call it directly instead of making an HTTP request to itself.
 */

/** Days of history in the trend chart. */
const TREND_DAYS = 14;

/** Statuses that mean the pipeline has finished with a document. */
const PROCESSED = ["PENDING", "FLAGGED", "VERIFIED", "REJECTED"] as const;

/**
 * Local calendar date as YYYY-MM-DD.
 *
 * Deliberately not `toISOString()`: that converts to UTC first, so in IST
 * (UTC+5:30) local midnight becomes 18:30 the previous day and every bucket
 * lands on the wrong bar — with today missing from the chart entirely. A
 * revenue office reads its dashboard in local time, so bucket in local time.
 */
function localDate(value: Date): string {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export async function getDashboardStats(
  district?: string | null,
): Promise<DashboardStats> {
  // A district filter scopes everything below it — doc 04's filter row.
  const scope = district ? { record: { district } } : {};

  const since = new Date();
  since.setDate(since.getDate() - (TREND_DAYS - 1));
  since.setHours(0, 0, 0, 0);

  const [statusCounts, records, districtRows, trendRows] = await Promise.all([
    db.document.groupBy({
      by: ["status"],
      where: scope,
      _count: { _all: true },
    }),
    // Confidence maps for the accuracy figure (CLAUDE.md D7).
    db.extractedRecord.findMany({
      where: district ? { district } : {},
      select: { confidence: true },
    }),
    db.extractedRecord.groupBy({
      by: ["district"],
      where: { district: { not: null } },
      _count: { _all: true },
    }),
    db.document.findMany({
      where: { ...scope, createdAt: { gte: since } },
      select: { createdAt: true },
    }),
  ]);

  const countOf = (status: string) =>
    statusCounts.find((row) => row.status === status)?._count._all ?? 0;

  const totalProcessed = PROCESSED.reduce(
    (sum, status) => sum + countOf(status),
    0,
  );

  // Mean of every per-field confidence value across every extracted record.
  let scoreSum = 0;
  let scoreCount = 0;
  for (const record of records) {
    for (const score of Object.values((record.confidence ?? {}) as ConfidenceMap)) {
      if (typeof score === "number") {
        scoreSum += score;
        scoreCount += 1;
      }
    }
  }
  const avgAccuracy = scoreCount === 0 ? 0 : scoreSum / scoreCount;

  // Fill every day in the window, so a quiet day is a gap in the chart rather
  // than a missing bar that silently compresses the timeline.
  const byDay = new Map<string, number>();
  for (let i = 0; i < TREND_DAYS; i += 1) {
    const day = new Date(since);
    day.setDate(since.getDate() + i);
    byDay.set(localDate(day), 0);
  }
  for (const row of trendRows) {
    const key = localDate(row.createdAt);
    if (byDay.has(key)) byDay.set(key, (byDay.get(key) ?? 0) + 1);
  }

  return {
    totalProcessed,
    avgAccuracy,
    pendingVerification: countOf("PENDING"),
    flagged: countOf("FLAGGED"),
    byDistrict: districtRows
      .map((row) => ({ district: row.district as string, count: row._count._all }))
      .sort((a, b) => b.count - a.count),
    trend: [...byDay.entries()].map(([date, count]) => ({ date, count })),
  };
}
