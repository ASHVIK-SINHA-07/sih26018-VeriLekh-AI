import { db } from "@/lib/db";
import { toJson } from "@/lib/json";
import { runOcr, type OcrResult } from "@/lib/ocr";
import { extractFields } from "@/lib/extract";
import { applyLearnedCorrections } from "@/lib/learning";
import { scoreRecord } from "@/lib/quality";
import { gatherEvidence, loadParcelHistory } from "@/lib/evidence";
import { classifyDocument, extractMutationOrder, validateMutationOrder } from "@/lib/mutation-order";
import { validateRecord, type ExistingRecord } from "@/lib/validate";
import type { DocumentStatus, ExtractResponse } from "@/types";

/**
 * The extraction pipeline for one document:
 *
 *   scan → runOcr → classifyDocument ─┬─ khatauni:  extractFields → applyLearnedCorrections
 *                                     │             → validateRecord → persist → set status
 *                                     └─ mutation order: extractMutationOrder
 *                                                   → preview against the parcel's chain → persist
 *
 * Lives here rather than in the route handler because two callers need it:
 * the background worker that drains the queue, and the API route when a
 * caller explicitly asks to run it inline.
 *
 * No ULPIN is minted. A record that extracts cleanly becomes PENDING and
 * waits for a person; anything with a problem becomes FLAGGED. Nothing
 * reaches VERIFIED without a human (CLAUDE.md D21).
 */
export async function runExtraction(documentId: string): Promise<ExtractResponse> {
  const document = await db.document.findUnique({ where: { id: documentId } });
  if (!document) throw new Error(`No document ${documentId}`);

  const ocr = await runOcr(document.filePath);

  // What kind of page this is decides which fields are read off it. Decided
  // from the page's own heading, so a mixed batch can go in one upload.
  if (classifyDocument(ocr).kind === "MUTATION_ORDER") {
    return runMutationOrder(documentId, ocr);
  }

  const raw = extractFields(ocr);

  // Apply corrections officers have already made. The recogniser repeats its
  // mistakes — the same district name, the same transposed matra — so a fix a
  // person made once is applied here before anyone has to make it again.
  const { fields, confidence, applied } = await applyLearnedCorrections(
    raw.fields,
    raw.confidence,
  );

  // Only records a person has already signed off count as the source of
  // truth to compare against.
  const existing: ExistingRecord[] = await db.extractedRecord.findMany({
    where: { document: { status: "VERIFIED" }, documentId: { not: documentId } },
    select: {
      documentId: true, ulpin: true, ownerName: true, khasraNumber: true,
      khataNumber: true, village: true, district: true,
    },
  });

  const validation = validateRecord({
    fields, confidence, existing, selfDocumentId: documentId,
  });

  // A substituted value is never applied silently — the reviewer is told what
  // was replaced and how much human agreement stands behind it.
  for (const c of applied) {
    validation.issues.push({
      field: c.field,
      issue:
        `Corrected automatically — read as "${c.from}", replaced with ` +
        `"${c.to}". Officers have made this same correction ` +
        `${c.occurrences} time${c.occurrences === 1 ? "" : "s"} before.`,
    });
  }

  const status: DocumentStatus =
    validation.status === "PASS" ? "PENDING" : "FLAGGED";

  // Scored after the learned corrections and the validation findings are in,
  // so the number reflects the record a reviewer will actually see.
  // Judged on the same evidence the reviewer will see: what other systems
  // hold for this parcel and how its ownership came about (D50).
  const evidence = await gatherEvidence(fields);
  const quality = scoreRecord({
    fields, confidence, issues: [...validation.issues, ...evidence.issues],
  });

  const recordData = {
    ownerName: fields.ownerName, surveyNumber: fields.surveyNumber,
    khasraNumber: fields.khasraNumber, khataNumber: fields.khataNumber,
    plotArea: fields.plotArea, village: fields.village, tehsil: fields.tehsil,
    district: fields.district, landClassification: fields.landClassification,
    confidence,
    qualityScore: quality.score,
  };

  await db.$transaction([
    // A page re-read as a khatauni carries no stale mutation-order reading.
    db.extractedMutation.deleteMany({ where: { documentId } }),
    db.extractedRecord.upsert({
      where: { documentId },
      update: recordData,
      create: { documentId, ...recordData },
    }),
    db.validationResult.upsert({
      where: { documentId },
      update: {
        status: validation.status,
        issues: toJson(validation.issues),
        duplicateOfId: validation.duplicateOf,
      },
      create: {
        documentId,
        status: validation.status,
        issues: toJson(validation.issues),
        duplicateOfId: validation.duplicateOf,
      },
    }),
    db.document.update({ where: { id: documentId }, data: { status, documentType: "KHATAUNI" } }),
  ]);

  return {
    documentId,
    status,
    extractedFields: fields,
    confidence,
    validation,
    documentType: "KHATAUNI",
    mutationFields: null,
  };
}

/**
 * A दाखिल-खारिज order: read it, then check it against the parcel's chain as
 * it would stand if the order were accepted.
 *
 * Nothing is added to the register here. The order becomes PENDING or
 * FLAGGED and waits for an officer; only their approval turns it into a
 * mutation entry (the verify route). So a double sale is stopped at intake,
 * with the finding in front of the officer, rather than discovered later in
 * a chain that already contains it.
 */
async function runMutationOrder(documentId: string, ocr: OcrResult): Promise<ExtractResponse> {
  const { fields, confidence } = extractMutationOrder(ocr);
  const history = await loadParcelHistory(fields);
  const checked = validateMutationOrder({ fields, confidence, existing: history.rows });

  const status: DocumentStatus = checked.status === "PASS" ? "PENDING" : "FLAGGED";
  const data = { ...fields, confidence: toJson(confidence) };

  await db.$transaction([
    // A page re-read as an order carries no stale khatauni reading.
    db.extractedRecord.deleteMany({ where: { documentId } }),
    db.extractedMutation.upsert({
      where: { documentId },
      update: data,
      create: { documentId, ...data },
    }),
    db.validationResult.upsert({
      where: { documentId },
      update: { status: checked.status, issues: toJson(checked.issues), duplicateOfId: null },
      create: { documentId, status: checked.status, issues: toJson(checked.issues), duplicateOfId: null },
    }),
    db.document.update({ where: { id: documentId }, data: { status, documentType: "MUTATION_ORDER" } }),
  ]);

  return {
    documentId,
    status,
    // The contract's khatauni fields, carrying only what the order shares
    // with a khatauni: which parcel it is about.
    extractedFields: {
      ownerName: null, surveyNumber: null, khasraNumber: fields.khasraNumber,
      khataNumber: null, plotArea: null, village: fields.village, tehsil: null,
      district: fields.district, landClassification: null, ulpin: null,
    },
    confidence,
    validation: { status: checked.status, issues: checked.issues, duplicateOf: null },
    documentType: "MUTATION_ORDER",
    mutationFields: fields,
  };
}
