import { db } from "@/lib/db";
import { toJson } from "@/lib/json";
import { runOcr } from "@/lib/ocr";
import { extractFields } from "@/lib/extract";
import { applyLearnedCorrections } from "@/lib/learning";
import { validateRecord, type ExistingRecord } from "@/lib/validate";
import type { DocumentStatus, ExtractResponse } from "@/types";

/**
 * The extraction pipeline for one document:
 *
 *   scan → runOcr → extractFields → applyLearnedCorrections
 *        → validateRecord → persist → set status
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

  const recordData = {
    ownerName: fields.ownerName, surveyNumber: fields.surveyNumber,
    khasraNumber: fields.khasraNumber, khataNumber: fields.khataNumber,
    plotArea: fields.plotArea, village: fields.village, tehsil: fields.tehsil,
    district: fields.district, landClassification: fields.landClassification,
    confidence,
  };

  await db.$transaction([
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
    db.document.update({ where: { id: documentId }, data: { status } }),
  ]);

  return {
    documentId,
    status,
    extractedFields: fields,
    confidence,
    validation,
  };
}
