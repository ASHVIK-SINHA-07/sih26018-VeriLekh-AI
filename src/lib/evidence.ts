import { db } from "@/lib/db";
import { reconcile, reconciliationIssues, type AuthoritativeRow, type ReconciliationSummary, type SourceName } from "@/lib/reconcile";
import { analyseChain, type ChainAnalysis, type MutationKind, type MutationRow } from "@/lib/chain";
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
    code: f.code ?? f.kind,
    params: f.params,
  }));
}

export interface ParcelKey {
  khasraNumber: string | null;
  village: string | null;
  district: string | null;
}

/**
 * The parcel these fields describe, and its mutation register. Khasra is
 * matched exactly and place leniently (D49). Shared by everything that needs a
 * parcel's history — the khatauni's evidence, a mutation order's preview, and
 * the approve route that adds an entry — so all three find the same parcel.
 */
export async function loadParcelHistory(key: ParcelKey): Promise<{ parcelId: string | null; rows: MutationRow[] }> {
  const khasra = key.khasraNumber?.trim();
  if (!khasra || !key.village || !key.district) return { parcelId: null, rows: [] };

  const candidates = await db.parcel.findMany({ where: { khasraNumber: khasra }, include: { mutations: true } });
  const parcel = candidates.find(
    (p) => samePlace(key.village as string, p.village) && samePlace(key.district as string, p.district),
  );
  if (!parcel) return { parcelId: null, rows: [] };

  return {
    parcelId: parcel.id,
    rows: parcel.mutations.map((m) => ({
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
      sourceDocumentId: m.sourceDocumentId,
      orderReference: m.orderReference,
    })),
  };
}

export async function gatherEvidence(fields: ExtractedFields): Promise<Evidence> {
  const khasra = fields.khasraNumber?.trim();
  const [sourceRows, history] = await Promise.all([
    khasra ? db.authoritativeRecord.findMany({ where: { khasraNumber: khasra } }) : Promise.resolve([]),
    loadParcelHistory(fields),
  ]);

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

  const chain = analyseChain({ mutations: history.rows, recordOwner: fields.ownerName });
  const parcel = history.parcelId ? { id: history.parcelId } : null;

  return {
    reconciliation,
    chain,
    parcelId: parcel?.id ?? null,
    issues: [...reconciliationIssues(reconciliation), ...chainIssues(chain)],
  };
}
