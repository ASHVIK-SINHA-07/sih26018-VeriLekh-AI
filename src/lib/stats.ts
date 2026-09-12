import { db } from "@/lib/db";
import { fromJson } from "@/lib/json";
import { tallyRecords } from "@/lib/error-stats";
import { stateOf } from "@/lib/geography";
import type { ConfidenceMap, DashboardStats, ValidationIssue } from "@/types";

/** Fields that make up a Record of Rights — the denominator for accuracy. */
const RECORD_FIELDS = 9;

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

  const [statusCounts, records, districtRows, trendRows, approved, results, placed] = await Promise.all([
    db.document.groupBy({
      by: ["status"],
      where: scope,
      _count: { _all: true },
    }),
    // Confidence maps for the accuracy figure (CLAUDE.md D7).
    db.extractedRecord.findMany({
      where: district ? { district } : {},
      select: { confidence: true, qualityScore: true },
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
    // Approved Records of Rights, each with how many of its fields an
    // officer corrected before approving.
    db.document.findMany({
      where: { ...scope, status: "VERIFIED", documentType: "KHATAUNI" },
      select: { _count: { select: { auditLogs: { where: { action: "EDIT_FIELD" } } } } },
    }),
    // Stored validation, for results and error statistics. Rejected
    // documents are out of the working set.
    db.validationResult.findMany({
      where: { document: { ...scope, status: { not: "REJECTED" } } },
      select: { status: true, issues: true },
    }),
    // Every document with the district it belongs to, for the state view.
    db.document.findMany({
      select: {
        status: true,
        record: { select: { district: true } },
        mutation: { select: { district: true } },
      },
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

  // Mean data quality across records that have been scored.
  //
  // Reported separately from avgAccuracy, and it is the one shown on the
  // dashboard: mean confidence answers "how sure was the reader of the
  // characters", which is easy to mistake for "how correct is this record".
  // The quality score answers the question people actually mean.
  const scored = records
    .map((r) => r.qualityScore)
    .filter((q): q is number => typeof q === "number");
  const avgQuality = scored.length === 0
    ? 0
    : Math.round(scored.reduce((a, b) => a + b, 0) / scored.length);
  const lowQuality = scored.filter((q) => q < 70).length;

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

  const corrected = approved.reduce((sum, doc) => sum + doc._count.auditLogs, 0);
  const fieldTotal = approved.length * RECORD_FIELDS;
  const fieldAccuracy = {
    accepted: Math.max(0, fieldTotal - corrected),
    total: fieldTotal,
    records: approved.length,
  };

  const validation = {
    pass: results.filter((r) => r.status === "PASS").length,
    flagged: results.filter((r) => r.status === "FLAGGED").length,
    duplicate: results.filter((r) => r.status === "DUPLICATE").length,
    notRead: countOf("UPLOADED") + countOf("PROCESSING"),
  };
  const errorCounts = tallyRecords(results.map((r) => fromJson<ValidationIssue[]>(r.issues, [])));

  // State → its documents, counted by where each record says it is.
  const states = new Map<string, { documents: number; verified: number; awaiting: number; districts: Set<string> }>();
  for (const doc of placed) {
    const district = doc.record?.district ?? doc.mutation?.district ?? null;
    if (!district) continue; // not read yet: no place to put it
    const state = stateOf(district) ?? "UNASSIGNED";
    const row = states.get(state) ?? { documents: 0, verified: 0, awaiting: 0, districts: new Set<string>() };
    row.documents += 1;
    if (doc.status === "VERIFIED") row.verified += 1;
    if (doc.status === "PENDING" || doc.status === "FLAGGED") row.awaiting += 1;
    row.districts.add(district);
    states.set(state, row);
  }
  const byState = [...states.entries()]
    .map(([state, row]) => ({
      state: state as "UP" | "UNASSIGNED",
      documents: row.documents,
      verified: row.verified,
      awaiting: row.awaiting,
      districts: row.districts.size,
    }))
    .sort((a, b) => (a.state === "UNASSIGNED" ? 1 : b.state === "UNASSIGNED" ? -1 : b.documents - a.documents));

  return {
    totalProcessed,
    fieldAccuracy,
    validation,
    errorCounts,
    byState,
    avgAccuracy,
    avgQuality,
    lowQuality,
    pendingVerification: countOf("PENDING"),
    flagged: countOf("FLAGGED"),
    byDistrict: districtRows
      .map((row) => ({ district: row.district as string, count: row._count._all }))
      .sort((a, b) => b.count - a.count),
    trend: [...byDay.entries()].map(([date, count]) => ({ date, count })),
  };
}
