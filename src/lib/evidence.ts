import { db } from "@/lib/db";
import { reconcile, reconciliationIssues, type AuthoritativeRow, type ReconciliationSummary, type SourceName } from "@/lib/reconcile";
import { analyseChain, type ChainAnalysis, type MutationKind } from "@/lib/chain";
import { samePlace } from "@/lib/similarity";
import type { ExtractedFields, ValidationIssue } from "@/types";

/**
 * Everything the system knows about a parcel beyond the page in front of it:
 * what other government systems hold, and how ownership came to be what it
 * is. Gathered in one place so every caller — the pipeline that stores a
 * score, the verify route that rescores on approval, the page a reviewer
 * reads, and the seed — judges a record on the same evidence. When they did
 * not, the quality panel and the reconciliation panel told reviewers different
 * stories about the same parcel (CLAUDE.md D50).
 */

export interface Evidence {
  reconciliation: ReconciliationSummary;
  chain: ChainAnalysis;
  parcelId: string | null;
  /** Findings from both, as issues the quality score can weigh. */
  issues: ValidationIssue[];
}

/** Chain findings as scoreable issues. Chain problems are problems of ownership. */
export function chainIssues(chain: ChainAnalysis): ValidationIssue[] {
  return chain.findings.map((f) => ({
    field: "ownerName",
    kind: f.severity === "critical" ? ("chainDefect" as const) : ("chainWarning" as const),
    issue: f.message,
  }));
}

export async function gatherEvidence(fields: ExtractedFields): Promise<Evidence> {
  const khasra = fields.khasraNumber?.trim();

  // Both lookups are narrowed by khasra, which is matched exactly (D49), then
  // by place, which is matched leniently — a misread village is still the
  // same village, but a misread parcel number is a different parcel.
  const [sourceRows, parcels] = khasra
    ? await Promise.all([
        db.authoritativeRecord.findMany({ where: { khasraNumber: khasra } }),
        db.parcel.findMany({ where: { khasraNumber: khasra }, include: { mutations: true } }),
      ])
    : [[], []];

  const reconciliation = reconcile({
    fields,
    sources: sourceRows.map((r): AuthoritativeRow => ({
      source: r.source as SourceName,
      khasraNumber: r.khasraNumber,
      village: r.village,
      district: r.district,
      ownerName: r.ownerName,
      khataNumber: r.khataNumber,
      plotArea: r.plotArea,
      landClassification: r.landClassification,
      asOf: r.asOf,
    })),
  });

  const parcel = parcels.find(
    (p) => fields.village && fields.district &&
      samePlace(fields.village, p.village) && samePlace(fields.district, p.district),
  ) ?? null;

  const chain = analyseChain({
    mutations: (parcel?.mutations ?? []).map((m) => ({
      id: m.id,
      seq: m.seq,
      mutationNumber: m.mutationNumber,
      type: m.type as MutationKind,
      fromOwner: m.fromOwner,
      toOwner: m.toOwner,
      share: m.share,
      effectiveDate: m.effectiveDate,
      recordedAt: m.recordedAt,
      supersedesId: m.supersedesId,
    })),
    recordOwner: fields.ownerName,
  });

  return {
    reconciliation,
    chain,
    parcelId: parcel?.id ?? null,
    issues: [...reconciliationIssues(reconciliation), ...chainIssues(chain)],
  };
}
