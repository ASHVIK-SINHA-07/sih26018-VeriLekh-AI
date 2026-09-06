import { db } from "@/lib/db";
import type { ConfidenceMap, ExtractedFieldName, ExtractedFields } from "@/types";

/**
 * Learning from officer corrections.
 *
 * The system does not retrain a model — it remembers. Recognition errors on
 * land registers are highly repetitive: one district's register hand, one
 * faded stamp, one matra the engine consistently transposes. Each correction
 * an officer makes is stored as a substitution keyed to that field, and future
 * extractions apply it before the record reaches a human.
 *
 * The guarantees that make this safe to run automatically:
 *   · a correction is only ever one a person actually made and approved
 *   · it is matched exactly, and only within the same field
 *   · applying one is recorded in the validation result, so a reviewer always
 *     sees that a value was substituted and what it replaced
 */

/** Values shorter than this are too ambiguous to key a substitution on. */
const MIN_LEARNABLE_LENGTH = 2;

/** Lookup key: trimmed and case-folded. Devanagari has no case, Latin does. */
function key(value: string): string {
  return value.trim().toLowerCase();
}

/**
 * Whether a correction is safe to remember.
 *
 * Rejects the cases where a substitution would do more harm than good: a field
 * that was blank or cleared, a value too short to identify (remembering that
 * "1" should be "7" would rewrite every other "1" on every future page), and a
 * change that only differs by whitespace or case.
 */
export function learnable(
  wrongValue: string | null,
  rightValue: string | null,
): boolean {
  if (!wrongValue || !rightValue) return false;
  const from = key(wrongValue);
  const to = key(rightValue);
  if (from.length < MIN_LEARNABLE_LENGTH) return false;
  if (!to) return false;
  return from !== to;
}

export interface AppliedCorrection {
  field: ExtractedFieldName;
  from: string;
  to: string;
  occurrences: number;
}

/**
 * Record what an officer changed. Called once per corrected field when a
 * record is approved or rejected.
 */
export async function learnCorrection(
  field: string,
  wrongValue: string | null,
  rightValue: string | null,
): Promise<void> {
  if (!wrongValue || !rightValue) return;

  if (!learnable(wrongValue, rightValue)) return;
  const from = key(wrongValue);
  const to = rightValue!.trim();

  await db.learnedCorrection.upsert({
    where: { field_wrongValue: { field, wrongValue: from } },
    update: { rightValue: to, occurrences: { increment: 1 } },
    create: { field, wrongValue: from, rightValue: to },
  });
}

/**
 * Apply everything learned so far to a freshly extracted record.
 *
 * Returns the corrected fields, an updated confidence map, and the list of
 * substitutions made so they can be shown to the reviewer. A corrected field's
 * confidence is raised — a human has vouched for this exact substitution
 * before — but not to certainty, because it is a remembered fix rather than a
 * fresh reading.
 */
export async function applyLearnedCorrections(
  fields: ExtractedFields,
  confidence: ConfidenceMap,
): Promise<{
  fields: ExtractedFields;
  confidence: ConfidenceMap;
  applied: AppliedCorrection[];
}> {
  const candidates = Object.entries(fields)
    .filter(([name, value]) => name !== "ulpin" && typeof value === "string" && value.trim())
    .map(([name, value]) => ({ field: name, wrongValue: key(value as string) }));

  if (candidates.length === 0) {
    return { fields, confidence, applied: [] };
  }

  const matches = await db.learnedCorrection.findMany({
    where: { OR: candidates },
  });
  if (matches.length === 0) {
    return { fields, confidence, applied: [] };
  }

  const corrected: ExtractedFields = { ...fields };
  const scores: ConfidenceMap = { ...confidence };
  const applied: AppliedCorrection[] = [];

  for (const match of matches) {
    const field = match.field as ExtractedFieldName;
    const current = corrected[field];
    if (typeof current !== "string" || key(current) !== match.wrongValue) continue;

    applied.push({
      field,
      from: current,
      to: match.rightValue,
      occurrences: match.occurrences,
    });
    corrected[field] = match.rightValue;

    // Confidence reflects how often a person has confirmed this substitution,
    // capped below certainty — it is a remembered fix, not a fresh reading.
    // Rounded to two places: this value is rendered as a percentage, and
    // CLAUDE.md forbids floating-point artifacts reaching the screen.
    const existing = scores[field] ?? 0;
    const boosted = Math.min(0.95, Math.max(existing, 0.8 + match.occurrences * 0.03));
    scores[field] = Math.round(boosted * 100) / 100;
  }

  if (applied.length > 0) {
    await db.learnedCorrection.updateMany({
      where: {
        OR: applied.map((a) => ({ field: a.field, wrongValue: key(a.from) })),
      },
      data: { applied: { increment: 1 } },
    });
  }

  return { fields: corrected, confidence: scores, applied };
}

/** Counts for the dashboard: how much the system has learned, and used. */
export async function learningStats() {
  const [distinct, totals] = await Promise.all([
    db.learnedCorrection.count(),
    db.learnedCorrection.aggregate({
      _sum: { occurrences: true, applied: true },
    }),
  ]);
  return {
    distinctCorrections: distinct,
    timesTaught: totals._sum.occurrences ?? 0,
    timesApplied: totals._sum.applied ?? 0,
  };
}
