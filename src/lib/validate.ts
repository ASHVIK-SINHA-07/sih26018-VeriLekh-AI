import { compareNames, samePlace } from "@/lib/similarity";
import {
  FIELD_LABELS,
  LOW_CONFIDENCE_THRESHOLD,
  type ConfidenceMap,
  type ExtractedFieldName,
  type ExtractedFields,
  type ValidationIssue,
  type ValidationSummary,
} from "@/types";

/**
 * Validation engine — docs/01_PRD.md F6.
 *
 * Three classes of check: required fields present, values within plausible
 * ranges, and duplicate or conflicting parcels.
 *
 * Existing records are passed in rather than queried here, so the whole engine
 * is a pure function and unit-testable without a database (T4 DoD). The caller
 * — the extract API route in T5 — supplies the candidate set.
 */

/** A record already in the system, for duplicate and conflict detection. */
export interface ExistingRecord {
  documentId: string;
  ulpin: string | null;
  ownerName: string | null;
  khasraNumber: string | null;
  khataNumber: string | null;
  village: string | null;
  district: string | null;
}

/**
 * Fields that must be present for a record to be committed. Survey number is
 * excluded on purpose: many older khatauni pages record khasra and khata only.
 */
const REQUIRED_FIELDS: ExtractedFieldName[] = [
  "ownerName",
  "khasraNumber",
  "khataNumber",
  "plotArea",
  "village",
  "tehsil",
  "district",
];

/**
 * Plot area bounds in hectares. The floor rules out a decimal-point
 * misread; the ceiling is well above any single realistic holding, so it
 * catches a digit inserted by bad OCR rather than a genuinely large parcel.
 */
const MIN_PLOT_AREA_HECTARES = 0.0001;
const MAX_PLOT_AREA_HECTARES = 10_000;

function normalise(value: string | null): string {
  return (value ?? "").trim().toLowerCase();
}

/**
 * Same physical parcel: same district, same village, same khasra number.
 *
 * The khasra number must match exactly — it is the parcel's identifier and a
 * single digit's difference is a different plot. District and village are
 * compared allowing for spelling variation, because they are read off the
 * same faded paper and a duplicate should not be missed over one character.
 */
function isSameParcel(fields: ExtractedFields, existing: ExistingRecord): boolean {
  const khasra = normalise(fields.khasraNumber);
  if (!khasra || khasra !== normalise(existing.khasraNumber)) return false;
  return (
    samePlace(fields.district, existing.district) &&
    samePlace(fields.village, existing.village)
  );
}

/** Same khata holding, used to spot a contradictory owner name. */
function isSameKhata(fields: ExtractedFields, existing: ExistingRecord): boolean {
  const khata = normalise(fields.khataNumber);
  if (!khata || khata !== normalise(existing.khataNumber)) return false;
  return (
    samePlace(fields.district, existing.district) &&
    samePlace(fields.village, existing.village)
  );
}

function checkRequiredFields(fields: ExtractedFields): ValidationIssue[] {
  return REQUIRED_FIELDS.filter(
    (field) => !fields[field] || String(fields[field]).trim().length === 0,
  ).map((field) => ({
    field,
    issue: `${FIELD_LABELS[field]} is missing`,
  }));
}

function checkRanges(fields: ExtractedFields): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  if (fields.plotArea) {
    const area = Number.parseFloat(fields.plotArea);
    if (Number.isNaN(area)) {
      issues.push({
        field: "plotArea",
        issue: `Plot area is not a number ("${fields.plotArea}")`,
      });
    } else if (area <= 0) {
      issues.push({ field: "plotArea", issue: "Plot area must be greater than zero" });
    } else if (area < MIN_PLOT_AREA_HECTARES) {
      issues.push({
        field: "plotArea",
        issue: `Plot area ${area} ha is implausibly small — check the decimal point`,
      });
    } else if (area > MAX_PLOT_AREA_HECTARES) {
      issues.push({
        field: "plotArea",
        issue: `Plot area ${area} ha exceeds the plausible maximum of ${MAX_PLOT_AREA_HECTARES} ha`,
      });
    }
  }

  // A name carrying digits is almost always OCR bleed from an adjacent column.
  if (fields.ownerName && /\d/.test(fields.ownerName)) {
    issues.push({
      field: "ownerName",
      issue: "Owner name contains digits — likely misread from a neighbouring column",
    });
  }

  return issues;
}

function checkConfidence(confidence: ConfidenceMap): ValidationIssue[] {
  return Object.entries(confidence)
    .filter(([, score]) => typeof score === "number" && score < LOW_CONFIDENCE_THRESHOLD)
    .map(([field, score]) => ({
      field,
      issue: `Low confidence — ${Math.round((score as number) * 100)}%`,
    }));
}

export interface ValidationInput {
  fields: ExtractedFields;
  confidence: ConfidenceMap;
  existing: ExistingRecord[];
  /** Excluded from duplicate checks so a re-run never flags a record against itself. */
  selfDocumentId?: string;
}

/**
 * Validates an extracted record.
 *
 * Status is DUPLICATE if the same parcel already exists, FLAGGED if anything
 * else needs a human, PASS otherwise. DUPLICATE outranks FLAGGED: it is the
 * more specific finding and the one a reviewer must act on first.
 */
export function validateRecord({
  fields,
  confidence,
  existing,
  selfDocumentId,
}: ValidationInput): ValidationSummary {
  const others = existing.filter((record) => record.documentId !== selfDocumentId);

  const issues: ValidationIssue[] = [
    ...checkRequiredFields(fields),
    ...checkRanges(fields),
    ...checkConfidence(confidence),
  ];

  const duplicate = others.find((record) => isSameParcel(fields, record));
  if (duplicate) {
    issues.unshift({
      field: "khasraNumber",
      issue: duplicate.ulpin
        ? `Duplicate parcel — khasra ${fields.khasraNumber} in ${fields.village} is already recorded under ULPIN ${duplicate.ulpin}`
        : `Duplicate parcel — khasra ${fields.khasraNumber} in ${fields.village} is already recorded`,
    });

    return { status: "DUPLICATE", issues, duplicateOf: duplicate.documentId };
  }

  // Same khata holding, but the owner reads differently. How the difference is
  // reported depends on how different it actually is: an omitted surname or a
  // misread matra is a name variant to confirm, while an unrelated name on the
  // same holding is an ownership conflict.
  for (const record of others) {
    if (!isSameKhata(fields, record)) continue;
    if (!record.ownerName) continue;

    const match = compareNames(fields.ownerName, record.ownerName);
    if (match.verdict === "same") continue;

    const percent = Math.round(match.score * 100);
    issues.unshift({
      field: "ownerName",
      issue:
        match.verdict === "different"
          ? `Owner name conflicts with the existing record for khata ${fields.khataNumber} (${record.ownerName})`
          : match.subset
            ? `Owner name may be incomplete — the existing record for khata ${fields.khataNumber} reads "${record.ownerName}" (${percent}% match)`
            : `Owner name differs from the existing record for khata ${fields.khataNumber} — "${record.ownerName}" (${percent}% match); check for a misread`,
    });
    break;
  }

  return {
    status: issues.length > 0 ? "FLAGGED" : "PASS",
    issues,
    duplicateOf: null,
  };
}

/** Field names a reviewer should look at first — drives the amber styling in T7. */
export function lowConfidenceFields(confidence: ConfidenceMap): string[] {
  return Object.entries(confidence)
    .filter(([, score]) => typeof score === "number" && score < LOW_CONFIDENCE_THRESHOLD)
    .map(([field]) => field);
}
