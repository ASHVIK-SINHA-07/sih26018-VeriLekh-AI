import { db } from "@/lib/db";
import { fromJson } from "@/lib/json";
import { gatherEvidence } from "@/lib/evidence";
import { scoreRecord } from "@/lib/quality";
import { summarizeDistrictRisk, type DistrictRisk, type RecordRisk } from "@/lib/risk";
import { samePlace } from "@/lib/similarity";
import type { ConfidenceMap, ExtractedFields, IssueKind, ValidationIssue } from "@/types";

/**
 * Findings that mean something *contradicts* a record — as opposed to the
 * page having read badly. Only these can make a LOW score a field visit.
 * A name that reads slightly differently (`ownerVariant`) and a warning-only
 * chain finding are proofreads; missing, out-of-range and low-confidence
 * fields are rescans.
 */
const CONTRADICTIONS = new Set<IssueKind>([
  "duplicate", "ownerConflict", "sourceConflict", "sourceStale", "chainDefect",
]);

/**
 * When the same parcel appears more than once, which copy represents it.
 * The one an officer has signed off is the record of the parcel; a flagged
 * duplicate is a second scan of land already on file.
 */
const STATUS_RANK: Record<string, number> = {
  VERIFIED: 0, PENDING: 1, FLAGGED: 2, PROCESSING: 3, UPLOADED: 4,
};

/**
 * The DB-bound half of the district risk table (`risk.ts` is the pure half).
 *
 * Scored the same way the verify page scores a single record — same
 * `gatherEvidence` call, same `scoreRecord` call, same validation issues —
 * so a record's contribution to its district's row here always agrees with
 * what a reviewer sees when they open that one record (CLAUDE.md D50). The
 * alternative, reading the `qualityScore` column back off each row, is
 * cheaper but can drift from the evidence the moment a source record or a
 * mutation changes after this record was last scored.
 *
 * One `gatherEvidence` call per record. Fine at seed-corpus scale; the first
 * thing to change if this is pointed at a real district's backlog is turning
 * `gatherEvidence`'s two queries into one batched lookup keyed by khasra
 * number across all of this call's records, rather than each record
 * fetching its own.
 */
export async function getDistrictRisk(district?: string | null): Promise<DistrictRisk[]> {
  const all = await db.extractedRecord.findMany({
    where: {
      ...(district ? { district } : { district: { not: null } }),
      // A record an officer rejected has already had a person's judgement —
      // the scan was unusable. It is not a parcel waiting for a field visit.
      document: { status: { not: "REJECTED" } },
    },
    include: { document: { include: { validation: true } } },
  });

  // One parcel, one row. A duplicate scan of land already on file must not
  // send a second person to the same plot — so each parcel is represented by
  // its best copy, and the others are dropped. Khasra is matched exactly;
  // village and district leniently, the same rule duplicate detection uses.
  const ranked = [...all].sort(
    (a, b) => (STATUS_RANK[a.document.status] ?? 9) - (STATUS_RANK[b.document.status] ?? 9),
  );
  const records: typeof all = [];
  for (const r of ranked) {
    const sameParcel = r.khasraNumber && records.some(
      (kept) =>
        kept.khasraNumber?.trim() === r.khasraNumber?.trim() &&
        !!kept.village && !!r.village && samePlace(kept.village, r.village) &&
        !!kept.district && !!r.district && samePlace(kept.district, r.district),
    );
    if (!sameParcel) records.push(r);
  }

  const scored: RecordRisk[] = await Promise.all(
    records.map(async (record: (typeof records)[number]) => {
      const fields: ExtractedFields = {
        ownerName: record.ownerName, surveyNumber: record.surveyNumber,
        khasraNumber: record.khasraNumber, khataNumber: record.khataNumber,
        plotArea: record.plotArea, village: record.village, tehsil: record.tehsil,
        district: record.district, landClassification: record.landClassification,
        ulpin: record.ulpin,
      };

      const evidence = await gatherEvidence(fields);
      const validationIssues = fromJson<ValidationIssue[]>(
        record.document.validation?.issues, [],
      );

      const issues = [...validationIssues, ...evidence.issues];
      const quality = scoreRecord({
        fields,
        confidence: fromJson<ConfidenceMap>(record.confidence, {}),
        issues,
      });

      return {
        // Non-null: the query above already filters to district: { not: null }.
        district: record.district as string,
        quality: { score: quality.score, band: quality.band },
        reconciliation: {
          status: evidence.reconciliation.status,
          matched: evidence.reconciliation.matched,
        },
        chain: { status: evidence.chain.status, findings: evidence.chain.findings },
        contradicted: issues.some((i) => i.kind !== undefined && CONTRADICTIONS.has(i.kind)),
      };
    }),
  );

  return summarizeDistrictRisk(scored);
}
