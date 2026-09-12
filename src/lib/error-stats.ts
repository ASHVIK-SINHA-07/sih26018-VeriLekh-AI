import type { ErrorCategory, IssueKind, ValidationIssue } from "@/types";

/**
 * Error statistics — what kinds of problem the records carry.
 *
 * Findings are grouped into the categories a supervisor thinks in, and each
 * record counts once per category however many findings of that kind it
 * has: "three records have missing fields" is the useful number, not "seven
 * missing-field findings".
 */

/** Worst first — the order the dashboard lists them in. */
export const ERROR_CATEGORIES: ErrorCategory[] = [
  "duplicateParcel",
  "chain",
  "otherSystems",
  "ownerMismatch",
  "missing",
  "implausible",
  "lowConfidence",
  "autoCorrected",
];

const CATEGORY_OF: Record<IssueKind, ErrorCategory> = {
  duplicate: "duplicateParcel",
  chainDefect: "chain",
  chainWarning: "chain",
  sourceConflict: "otherSystems",
  sourceStale: "otherSystems",
  ownerConflict: "ownerMismatch",
  ownerVariant: "ownerMismatch",
  missing: "missing",
  range: "implausible",
  confidence: "lowConfidence",
  learned: "autoCorrected",
};

/** The categories one record's findings fall into, each once. */
export function categoriesOf(issues: ValidationIssue[]): Set<ErrorCategory> {
  const found = new Set<ErrorCategory>();
  for (const issue of issues) {
    const category = issue.kind ? CATEGORY_OF[issue.kind] : undefined;
    if (category) found.add(category);
  }
  return found;
}

/** Records per category, across many records' findings. */
export function tallyRecords(perRecord: ValidationIssue[][]): Record<ErrorCategory, number> {
  const counts = Object.fromEntries(ERROR_CATEGORIES.map((c) => [c, 0])) as Record<ErrorCategory, number>;
  for (const issues of perRecord) {
    for (const category of categoriesOf(issues)) counts[category] += 1;
  }
  return counts;
}
