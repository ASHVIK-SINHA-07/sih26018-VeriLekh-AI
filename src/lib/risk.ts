import type { QualityScore } from "@/lib/quality";
import type { ReconciliationSummary } from "@/lib/reconcile";
import type { ChainAnalysis } from "@/lib/chain";

/**
 * District-level risk aggregation.
 *
 * Every other panel in this system answers "what is wrong with this one
 * record?". A revenue officer supervising a district does not have time to
 * open every record and ask that — they need the inverse question answered
 * first: *which* records, out of thousands, are worth a person's time at
 * all? That is a triage problem, and it is the one an OCR pipeline alone
 * cannot help with, because a clean extraction and a wrong parcel look
 * identical in a text field.
 *
 * This is where the per-record engines earn their aggregate value: a single
 * record's reconciliation conflict or chain defect is one finding, but the
 * *rate* of those findings by district is a resourcing signal — which tehsil
 * office should get a field-verification team first, given a fixed number of
 * people and an unfixed backlog.
 *
 * Pure — like reconcile.ts and chain.ts, this takes already-computed results
 * and never queries anything, so it is testable without a database and the
 * caller decides how the three engines' outputs were produced (live query,
 * batch job, or a demo fixture).
 */

export interface RecordRisk {
  district: string;
  quality: Pick<QualityScore, "score" | "band">;
  reconciliation: Pick<ReconciliationSummary, "status" | "matched">;
  chain: Pick<ChainAnalysis, "status" | "findings">;
  /**
   * Whether anything contradicts this record — a duplicate parcel, another
   * system holding a different value, a broken chain of title, an owner
   * conflict. A LOW score with nothing contradicting it is a badly read page:
   * that is a rescan, not a field visit, for the same reason a warning-only
   * chain defect is a proofread rather than a visit.
   *
   * Optional, and an absent value is treated as `true`: a caller that cannot
   * tell why a record scored LOW gets the conservative answer — counted —
   * rather than a silent drop from the field-verification queue.
   */
  contradicted?: boolean;
}

export interface DistrictRisk {
  district: string;
  recordCount: number;

  meanQuality: number;
  lowQualityCount: number;

  /** Records actually matched to at least one external source. */
  reconciled: number;
  reconciliationConflicts: number;
  /** Of `reconciled`, not of `recordCount` — see summarizeDistrictRisk. */
  reconciliationConflictRate: number;

  /** Records with a non-empty mutation history. */
  chainsTraced: number;
  /** Any finding at all, critical or warning — chain.ts's own DEFECTS status. */
  chainDefects: number;
  /** The subset of `chainDefects` a title question, not a proofread. */
  criticalChainDefects: number;
  /**
   * `criticalChainDefects` over `chainsTraced` — not `chainDefects`, and not
   * `recordCount`. A warning-only defect (a backdated entry, an unreadable
   * share) needs a proofread; only a critical one (a double sale, a sale by
   * a dead man) is the "send someone to verify this on the ground" signal
   * this rate exists to surface.
   */
  chainDefectRate: number;

  /** A conflict, a critical chain defect, or a LOW quality band driven by a
   *  contradiction — the set a supervising officer would actually queue for
   *  field verification. A LOW band from a badly read page alone is excluded:
   *  that is a rescan, not a visit. */
  needsFieldVerification: number;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Group records by district and compute each district's risk profile.
 *
 * The two rate denominators are deliberately *not* `recordCount`. A district
 * where nothing has been checked against an external source yet would
 * otherwise show a reassuring 0% conflict rate for having verified nothing —
 * the same failure a mean-confidence score has if it is not weighted by how
 * much was actually read (quality.ts makes the same choice for that reason).
 * Rating "how much of what we checked disagreed" separately from "how much
 * have we checked" keeps a thin district from hiding as a clean one.
 *
 * Districts are returned worst-first by `needsFieldVerification`, since that
 * is the number a supervising officer reads this table to get.
 */
export function summarizeDistrictRisk(records: RecordRisk[]): DistrictRisk[] {
  const byDistrict = new Map<string, RecordRisk[]>();
  for (const r of records) {
    byDistrict.set(r.district, [...(byDistrict.get(r.district) ?? []), r]);
  }

  const rows: DistrictRisk[] = [...byDistrict.entries()].map(([district, recs]) => {
    const meanQuality = recs.length === 0
      ? 0
      : Math.round(recs.reduce((sum, r) => sum + r.quality.score, 0) / recs.length);
    const lowQualityCount = recs.filter((r) => r.quality.band === "LOW").length;

    const reconciled = recs.filter((r) => r.reconciliation.matched.length > 0);
    const reconciliationConflicts = reconciled.filter(
      (r) => r.reconciliation.status === "CONFLICTS",
    ).length;

    const chainsTraced = recs.filter((r) => r.chain.status !== "EMPTY");
    const chainDefects = chainsTraced.filter((r) => r.chain.status === "DEFECTS").length;
    const criticalChainDefects = chainsTraced.filter((r) =>
      r.chain.findings.some((f) => f.severity === "critical"),
    ).length;

    const needsFieldVerification = recs.filter(
      (r) =>
        (r.quality.band === "LOW" && r.contradicted !== false) ||
        r.reconciliation.status === "CONFLICTS" ||
        r.chain.findings.some((f) => f.severity === "critical"),
    ).length;

    return {
      district,
      recordCount: recs.length,
      meanQuality,
      lowQualityCount,
      reconciled: reconciled.length,
      reconciliationConflicts,
      reconciliationConflictRate:
        reconciled.length === 0 ? 0 : round2(reconciliationConflicts / reconciled.length),
      chainsTraced: chainsTraced.length,
      chainDefects,
      criticalChainDefects,
      chainDefectRate:
        chainsTraced.length === 0 ? 0 : round2(criticalChainDefects / chainsTraced.length),
      needsFieldVerification,
    };
  });

  return rows.sort((a, b) => b.needsFieldVerification - a.needsFieldVerification);
}
