import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { fromJson, toJson } from "@/lib/json";
import { appendAudit } from "@/lib/audit";
import { gatherEvidence, loadParcelHistory } from "@/lib/evidence";
import { scoreRecord } from "@/lib/quality";
import { samePlace } from "@/lib/similarity";
import {
  MUTATION_FIELD_LABELS, MUTATION_FIELD_NAMES, validateMutationOrder,
  type MutationConfidence, type MutationFields,
} from "@/lib/mutation-order";
import type {
  ConfidenceMap, DocumentStatus, ExtractedFields, ValidationIssue, VerifyRequest, VerifyResponse,
} from "@/types";

/**
 * Deciding a mutation order — the moment an entry joins a parcel's register.
 *
 * Approval is the only way anything enters the chain of title. Until this
 * runs, an order is a proposal the reviewer saw previewed against the chain;
 * after it, the order is a mutation entry pointing back at the scan it came
 * from (`sourceDocumentId`), with the officer who accepted it in the
 * hash-chained audit trail.
 *
 * An order whose type, date, share or transferee cannot be read is refused
 * rather than guessed at: a register entry is evidence of ownership, and one
 * built on a guess is worse than no entry.
 */
export async function decideMutationOrder(
  documentId: string,
  body: VerifyRequest,
  actorId: string,
  previousStatus: DocumentStatus,
): Promise<NextResponse> {
  const reading = await db.extractedMutation.findUnique({ where: { documentId } });
  if (!reading) {
    return NextResponse.json({ error: "This order has not been read yet" }, { status: 409 });
  }
  if (reading.mutationId) {
    return NextResponse.json({ error: "This order is already in the register" }, { status: 409 });
  }

  /* ------------------------------------------------ apply the corrections */
  const edits: { field: (typeof MUTATION_FIELD_NAMES)[number]; before: string | null; after: string | null }[] = [];
  for (const field of MUTATION_FIELD_NAMES) {
    if (!body.editedFields || !(field in body.editedFields)) continue;
    const raw = body.editedFields[field];
    const after = typeof raw === "string" && raw.trim().length > 0 ? raw.trim() : null;
    if (after !== reading[field]) edits.push({ field, before: reading[field], after });
  }

  const fields = Object.fromEntries(
    MUTATION_FIELD_NAMES.map((f) => [f, reading[f]]),
  ) as MutationFields;
  for (const e of edits) fields[e.field] = e.after;

  // A corrected field is one a person vouches for (D24).
  const confidence: MutationConfidence = { ...fromJson<MutationConfidence>(reading.confidence, {}) };
  for (const e of edits) confidence[e.field] = 1;

  const history = await loadParcelHistory(fields);
  const checked = validateMutationOrder({ fields, confidence, existing: history.rows });

  const approving = body.action === "approve";
  const candidate = checked.candidate;

  if (approving && (!candidate || !fields.khasraNumber || !fields.village || !fields.district)) {
    return NextResponse.json(
      {
        error:
          "This order cannot enter the register until its type of transfer, date, share, " +
          "transferee and parcel can all be read. Correct them against the scan, then approve.",
      },
      { status: 422 },
    );
  }

  const status: DocumentStatus = approving ? "VERIFIED" : "REJECTED";

  let entrySeq: number | null = null;
  await db.$transaction(async (tx) => {
    await tx.extractedMutation.update({
      where: { documentId },
      data: { ...fields, confidence: toJson(confidence) },
    });
    await tx.validationResult.upsert({
      where: { documentId },
      update: { status: checked.status, issues: toJson(checked.issues), duplicateOfId: null },
      create: { documentId, status: checked.status, issues: toJson(checked.issues), duplicateOfId: null },
    });

    if (approving && candidate) {
      // The parcel becomes first-class the moment its first order is accepted.
      const parcel = history.parcelId
        ? { id: history.parcelId }
        : await tx.parcel.upsert({
            where: {
              khasraNumber_village_district: {
                khasraNumber: (fields.khasraNumber as string).trim(),
                village: (fields.village as string).trim(),
                district: (fields.district as string).trim(),
              },
            },
            update: {},
            create: {
              khasraNumber: (fields.khasraNumber as string).trim(),
              village: (fields.village as string).trim(),
              district: (fields.district as string).trim(),
            },
          });

      // Position read inside the transaction, so two approvals for the same
      // parcel cannot both take the same place in the register.
      const last = await tx.mutation.findFirst({
        where: { parcelId: parcel.id }, orderBy: { seq: "desc" }, select: { seq: true },
      });
      entrySeq = (last?.seq ?? 0) + 1;

      const entry = await tx.mutation.create({
        data: {
          parcelId: parcel.id,
          seq: entrySeq,
          mutationNumber: candidate.mutationNumber,
          type: candidate.type,
          fromOwner: candidate.fromOwner,
          toOwner: candidate.toOwner,
          share: candidate.share,
          effectiveDate: candidate.effectiveDate,
          sourceDocumentId: documentId,
        },
      });
      await tx.extractedMutation.update({ where: { documentId }, data: { mutationId: entry.id } });
    }

    await tx.document.update({ where: { id: documentId }, data: { status } });

    await appendAudit(tx, [
      ...edits.map((e) => ({
        documentId,
        actorId,
        action: "EDIT_FIELD" as const,
        before: { field: MUTATION_FIELD_LABELS[e.field], value: e.before },
        after: { field: MUTATION_FIELD_LABELS[e.field], value: e.after },
      })),
      {
        documentId,
        actorId,
        action: approving ? ("APPROVE" as const) : ("REJECT" as const),
        before: { status: previousStatus },
        after: {
          status,
          fieldsCorrected: edits.length,
          ...(approving && candidate
            ? {
                enteredInRegister: {
                  khasra: fields.khasraNumber, village: fields.village,
                  mutationNumber: candidate.mutationNumber, entry: entrySeq,
                },
                // An officer accepting an order over a chain finding is a
                // human override, and it is recorded as one (D25).
                overrodeFindings: checked.introduced.map((f) => f.kind),
              }
            : {}),
        },
      },
    ]);
  });

  // The parcel's history just changed, so the khatauni record of the same
  // parcel is scored again — its stored number must describe the chain as
  // it now stands (D59). Outside the transaction: a failure to rescore must
  // never undo a decision an officer has already made.
  if (approving) {
    await rescoreParcelRecords(fields).catch(() => {});
  }

  const response: VerifyResponse = { documentId, status };
  return NextResponse.json(response);
}

async function rescoreParcelRecords(fields: MutationFields): Promise<void> {
  const khasra = fields.khasraNumber?.trim();
  if (!khasra) return;
  const records = await db.extractedRecord.findMany({
    where: { khasraNumber: khasra },
    include: { document: { include: { validation: true } } },
  });
  for (const r of records) {
    if (!r.village || !r.district || !fields.village || !fields.district) continue;
    if (!samePlace(r.village, fields.village) || !samePlace(r.district, fields.district)) continue;
    const recordFields: ExtractedFields = {
      ownerName: r.ownerName, surveyNumber: r.surveyNumber, khasraNumber: r.khasraNumber,
      khataNumber: r.khataNumber, plotArea: r.plotArea, village: r.village, tehsil: r.tehsil,
      district: r.district, landClassification: r.landClassification, ulpin: r.ulpin,
    };
    const evidence = await gatherEvidence(recordFields);
    const quality = scoreRecord({
      fields: recordFields,
      confidence: fromJson<ConfidenceMap>(r.confidence, {}),
      issues: [...fromJson<ValidationIssue[]>(r.document.validation?.issues, []), ...evidence.issues],
    });
    await db.extractedRecord.update({ where: { id: r.id }, data: { qualityScore: quality.score } });
  }
}
