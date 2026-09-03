import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { toJson } from "@/lib/json";
import { CAN_WRITE, requireRole } from "@/lib/api-auth";
import { runOcr } from "@/lib/ocr";
import { extractFields } from "@/lib/extract";
import { validateRecord, type ExistingRecord } from "@/lib/validate";
import type { DocumentStatus, ExtractResponse } from "@/types";

/**
 * POST /api/documents/[id]/extract — runs the T4 pipeline over a document.
 *
 *   scan → runOcr → extractFields → validateRecord → persist → set status
 *
 * No ULPIN is minted here. A record that extracts cleanly becomes PENDING and
 * waits for a person to approve it (CLAUDE.md D21); anything with a problem
 * becomes FLAGGED. Nothing reaches VERIFIED without a human.
 *
 * Re-runnable: the record and validation rows are upserted, so a document can
 * be re-extracted after a better scan without leaving orphans behind.
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const guard = await requireRole(CAN_WRITE);
  if (!guard.ok) return guard.response;

  const { id } = await params;

  const document = await db.document.findUnique({ where: { id } });
  if (!document) {
    return NextResponse.json({ error: "Document not found" }, { status: 404 });
  }

  await db.document.update({ where: { id }, data: { status: "PROCESSING" } });

  try {
    const ocr = await runOcr(document.filePath);
    const { fields, confidence } = extractFields(ocr);

    // Only records a human has already signed off count as the source of
    // truth to compare against. Validation lives in src/lib/validate.ts as a
    // pure function; the candidate set is supplied here (D18).
    const existing: ExistingRecord[] = (
      await db.extractedRecord.findMany({
        where: { document: { status: "VERIFIED" } },
        select: {
          documentId: true, ulpin: true, ownerName: true, khasraNumber: true,
          khataNumber: true, village: true, district: true,
        },
      })
    ).map((row) => row);

    const validation = validateRecord({
      fields,
      confidence,
      existing,
      selfDocumentId: id,
    });

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
        where: { documentId: id },
        update: recordData,
        create: { documentId: id, ...recordData },
      }),
      db.validationResult.upsert({
        where: { documentId: id },
        update: {
          status: validation.status,
          issues: toJson(validation.issues),
          duplicateOfId: validation.duplicateOf,
        },
        create: {
          documentId: id,
          status: validation.status,
          issues: toJson(validation.issues),
          duplicateOfId: validation.duplicateOf,
        },
      }),
      db.document.update({ where: { id }, data: { status } }),
    ]);

    const body: ExtractResponse = {
      documentId: id,
      status,
      extractedFields: fields,
      confidence,
      validation,
    };
    return NextResponse.json(body);
  } catch (error) {
    // Never strand a document in PROCESSING — it would sit in no queue at all.
    await db.document.update({ where: { id }, data: { status: "UPLOADED" } });
    console.error(`Extraction failed for document ${id}:`, error);
    return NextResponse.json(
      { error: "Extraction failed. The document has been returned to uploaded." },
      { status: 502 },
    );
  }
}
