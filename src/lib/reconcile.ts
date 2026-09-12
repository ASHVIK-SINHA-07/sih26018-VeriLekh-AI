import { FIELD_LABELS, type ExtractedFieldName, type ExtractedFields, type ValidationIssue } from "@/types";
import { compareNames, samePlace } from "@/lib/similarity";

/**
 * Cross-source reconciliation.
 *
 * Digitisation is largely done; the records that exist are the problem. The
 * documented failure is that the three systems holding a parcel disagree —
 * the textual Record of Rights, the sub-registrar's record of the last
 * transaction, and the cadastral record of the parcel's measured extent. A
 * quality evaluation of land records in Bihar found area-mismatch claims in
 * 11% of cases and ownership on the ground differing from the record in 8%,
 * with a large share of Records of Rights carrying inheritance that was never
 * mutated.
 *
 * Duplicate detection compares a new record against our own database. This
 * compares it against what other systems say about the same parcel, which is
 * the check the problem statement actually asks for and the one that catches
 * the errors that drive land disputes.
 *
 * Pure — sources are passed in, never queried here — so the whole engine is
 * testable in isolation, the same rule as `validate.ts` (CLAUDE.md D18).
 */

export type SourceName = "ROR" | "REGISTRATION" | "CADASTRAL";

export const SOURCE_LABELS: Record<SourceName, string> = {
  ROR: "Record of Rights",
  REGISTRATION: "Registration",
  CADASTRAL: "Cadastral survey",
};

export interface AuthoritativeRow {
  source: SourceName;
  khasraNumber: string;
  village: string;
  district: string;
  ownerName: string | null;
  khataNumber: string | null;
  plotArea: string | null;
  landClassification: string | null;
  asOf: Date;
}

/** Fields worth reconciling. ULPIN and place names identify the parcel rather than describing it. */
const RECONCILED: ExtractedFieldName[] = [
  "ownerName", "khataNumber", "plotArea", "landClassification",
];

/**
 * How far two stated areas may differ before it is a finding.
 *
 * Survey and revenue measurement genuinely disagree a little — different
 * instruments, different decades. Two percent absorbs that; beyond it, one of
 * the two records is wrong about how much land this is.
 */
const AREA_TOLERANCE = 0.02;

/** Beyond this, a source has not been updated in a very long time. */
const STALE_YEARS = 3;

export type Agreement =
  | "agrees"
  | "differs"
  | "variant"       // same value, likely a misreading rather than a real difference
  | "absent"        // the source does not carry this field
  | "unmatched";    // no source holds this parcel at all

export interface FieldFinding {
  field: ExtractedFieldName;
  ours: string | null;
  source: SourceName;
  theirs: string | null;
  agreement: Agreement;
  /** One line a reviewer reads. Only set when something is wrong. */
  message?: string;
  /** Message code and values for the interface's translations. */
  code?: string;
  params?: Record<string, string | number>;
}

export interface ReconciliationSummary {
  /** Sources that hold this parcel at all. */
  matched: SourceName[];
  findings: FieldFinding[];
  /** Findings that need a person — differs, or a stale source. */
  conflicts: FieldFinding[];
  /** Sources whose record predates STALE_YEARS. */
  stale: { source: SourceName; asOf: Date; years: number }[];
  status: "AGREES" | "CONFLICTS" | "NOT_FOUND";
}

function parcelMatches(fields: ExtractedFields, row: AuthoritativeRow): boolean {
  if (!fields.khasraNumber || !fields.village || !fields.district) return false;
  // Khasra is exact — it is the parcel's number, not a name to fuzzy-match.
  if (fields.khasraNumber.trim() !== row.khasraNumber.trim()) return false;
  return samePlace(fields.village, row.village) && samePlace(fields.district, row.district);
}

function compareArea(ours: string, theirs: string): { same: boolean; detail: string } {
  const a = Number.parseFloat(ours);
  const b = Number.parseFloat(theirs);
  if (Number.isNaN(a) || Number.isNaN(b)) {
    return { same: ours.trim() === theirs.trim(), detail: "" };
  }
  const larger = Math.max(Math.abs(a), Math.abs(b));
  if (larger === 0) return { same: a === b, detail: "" };
  const drift = Math.abs(a - b) / larger;
  const percent = Math.round(drift * 1000) / 10;
  return { same: drift <= AREA_TOLERANCE, detail: `${percent}%` };
}

function yearsSince(date: Date, now: Date): number {
  return (now.getTime() - date.getTime()) / (365.25 * 24 * 60 * 60 * 1000);
}

export interface ReconcileInput {
  fields: ExtractedFields;
  sources: AuthoritativeRow[];
  /** Injected so tests are not time-dependent. */
  now?: Date;
}

/**
 * Reconciliation findings as validation issues, so the quality score can weigh
 * them. Kept here rather than in quality.ts: the mapping from "a source
 * disagrees" to "how bad is that" belongs with the engine that knows what the
 * finding means.
 */
export function reconciliationIssues(result: ReconciliationSummary): ValidationIssue[] {
  const issues: ValidationIssue[] = result.conflicts
    .filter((c) => c.message)
    .map((c) => ({
      field: c.field,
      kind: "sourceConflict" as const,
      issue: c.message as string,
      code: c.code,
      params: c.params,
    }));

  for (const s of result.stale) {
    issues.push({
      field: "ownerName",
      kind: "sourceStale",
      issue: `${SOURCE_LABELS[s.source]} has not been updated in ${s.years} years — an ownership change may never have been mutated`,
      code: "reconStale",
      params: { source: s.source, years: s.years },
    });
  }

  return issues;
}

export function reconcile({ fields, sources, now = new Date() }: ReconcileInput): ReconciliationSummary {
  const matches = sources.filter((row) => parcelMatches(fields, row));

  if (matches.length === 0) {
    return {
      matched: [],
      findings: [],
      conflicts: [],
      stale: [],
      status: "NOT_FOUND",
    };
  }

  const findings: FieldFinding[] = [];

  for (const row of matches) {
    for (const field of RECONCILED) {
      const ours = fields[field];
      const theirs = row[field as keyof AuthoritativeRow] as string | null;

      if (theirs == null || String(theirs).trim() === "") {
        findings.push({ field, ours: ours ?? null, source: row.source, theirs: null, agreement: "absent" });
        continue;
      }
      if (ours == null || ours.trim() === "") {
        findings.push({
          field, ours: null, source: row.source, theirs, agreement: "differs",
          message: `${FIELD_LABELS[field]} is missing from this scan, but ${SOURCE_LABELS[row.source]} holds "${theirs}"`,
          code: "reconMissingHere", params: { field, source: row.source, value: theirs },
        });
        continue;
      }

      if (field === "plotArea") {
        const { same, detail } = compareArea(ours, theirs);
        findings.push({
          field, ours, source: row.source, theirs,
          agreement: same ? "agrees" : "differs",
          message: same
            ? undefined
            : `Plot area differs from ${SOURCE_LABELS[row.source]} — this scan reads ${ours} ha, that record holds ${theirs} ha (${detail} apart)`,
          code: same ? undefined : "reconArea",
          params: same ? undefined : { source: row.source, ours, theirs, pct: detail },
        });
        continue;
      }

      if (field === "ownerName") {
        // A misread name and a different owner are not the same finding: one
        // is a proofread, the other is a title question.
        const match = compareNames(ours, theirs);
        const agreement: Agreement =
          match.verdict === "same" ? "agrees" : match.verdict === "different" ? "differs" : "variant";
        findings.push({
          field, ours, source: row.source, theirs, agreement,
          message:
            agreement === "agrees"
              ? undefined
              : agreement === "differs"
                ? `Owner differs from ${SOURCE_LABELS[row.source]} — that record holds "${theirs}"`
                : `Owner name reads differently from ${SOURCE_LABELS[row.source]} ("${theirs}") — likely a misreading, confirm against the scan`,
          code: agreement === "agrees" ? undefined : agreement === "differs" ? "reconOwnerDiffers" : "reconOwnerVariant",
          params: agreement === "agrees" ? undefined : { source: row.source, theirs },
        });
        continue;
      }

      const same = ours.trim() === String(theirs).trim();
      findings.push({
        field, ours, source: row.source, theirs,
        agreement: same ? "agrees" : "differs",
        message: same
          ? undefined
          : `${FIELD_LABELS[field]} differs from ${SOURCE_LABELS[row.source]} — that record holds "${theirs}"`,
        code: same ? undefined : "reconFieldDiffers",
        params: same ? undefined : { field, source: row.source, theirs: String(theirs) },
      });
    }
  }

  const stale = matches
    .map((row) => ({ source: row.source, asOf: row.asOf, years: Math.floor(yearsSince(row.asOf, now)) }))
    .filter((s) => s.years >= STALE_YEARS);

  const conflicts = findings.filter((f) => f.agreement === "differs" || f.agreement === "variant");

  return {
    matched: [...new Set(matches.map((m) => m.source))],
    findings,
    conflicts,
    stale,
    status: conflicts.length > 0 || stale.length > 0 ? "CONFLICTS" : "AGREES",
  };
}
