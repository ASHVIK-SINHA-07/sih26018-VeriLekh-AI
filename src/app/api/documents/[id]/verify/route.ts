import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { CAN_WRITE, requireRole } from "@/lib/api-auth";
import { toJson } from "@/lib/json";
import { learnCorrection } from "@/lib/learning";
import { validateRecord, type ExistingRecord } from "@/lib/validate";
import { generateUlpin } from "@/lib/ulpin";
import {
  EXTRACTED_FIELD_NAMES,
  FIELD_LABELS,
  type ConfidenceMap,
  type DocumentStatus,
  type ExtractedFieldName,
  type ExtractedFields,
  type VerifyRequest,
  type VerifyResponse,
} from "@/types";

/**
 * PUT /api/documents/[id]/verify — the human decision point.
 *
 * Applies any corrections the verifier made, then approves or rejects.
 * On approval the record is committed and a ULPIN-style id is minted.
 *
 * Audit is the point of this route as much as the status change
 * (docs/03_Security_Access.md): each corrected field writes its own
 * EDIT_FIELD row with before and after, and the decision itself writes an
 * APPROVE or REJECT row. Nothing here is silent.
 */
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const guard = await requireRole(CAN_WRITE);
  if (!guard.ok) return guard.response;

  const { id } = await params;

  let body: VerifyRequest;
  try {
    body = (await request.json()) as VerifyRequest;
  } catch {
    return NextResponse.json({ error: "Expected a JSON body" }, { status: 400 });
  }

  if (body.action !== "approve" && body.action !== "reject") {
    return NextResponse.json(
      { error: 'action must be "approve" or "reject"' },
      { status: 400 },
    );
  }

  const document = await db.document.findUnique({
    where: { id },
    include: { record: true },
  });

  if (!document) {
    return NextResponse.json({ error: "Document not found" }, { status: 404 });
  }
  if (!document.record) {
    return NextResponse.json(
      { error: "This document has not been through extraction yet" },
      { status: 409 },
    );
  }

  const record = document.record;

  /* ------------------------------------------------ apply the corrections */

  const edits: { field: ExtractedFieldName; before: string | null; after: string | null }[] = [];

  if (body.editedFields) {
    for (const field of EXTRACTED_FIELD_NAMES) {
      if (!(field in body.editedFields)) continue;

      const raw = body.editedFields[field];
      const after = typeof raw === "string" && raw.trim().length > 0 ? raw.trim() : null;
      const before = record[field];

      if (after !== before) {
        edits.push({ field, before, after });
      }
    }
  }

  const corrected: ExtractedFields = {
    ownerName: record.ownerName, surveyNumber: record.surveyNumber,
    khasraNumber: record.khasraNumber, khataNumber: record.khataNumber,
    plotArea: record.plotArea, village: record.village, tehsil: record.tehsil,
    district: record.district, landClassification: record.landClassification,
    ulpin: record.ulpin,
  };
  for (const edit of edits) {
    corrected[edit.field] = edit.after;
  }

  /* --------------------------------------------------------- re-validate */

  // A field a human corrected is a field a human vouches for, so its
  // confidence is raised to 1. Leaving it at the OCR score would keep the
  // record looking uncertain after the uncertainty had been resolved.
  const confidence: ConfidenceMap = { ...(record.confidence as ConfidenceMap) };
  for (const edit of edits) {
    confidence[edit.field] = 1;
  }

  const existing: ExistingRecord[] = await db.extractedRecord.findMany({
    where: { document: { status: "VERIFIED" }, documentId: { not: id } },
    select: {
      documentId: true, ulpin: true, ownerName: true, khasraNumber: true,
      khataNumber: true, village: true, district: true,
    },
  });

  const validation = validateRecord({
    fields: corrected,
    confidence,
    existing,
    selfDocumentId: id,
  });

  /* ------------------------------------------------------ commit the call */

  const approving = body.action === "approve";
  const status: DocumentStatus = approving ? "VERIFIED" : "REJECTED";
  // Mint a ULPIN only on approval, and only if the record has none yet.
  const ulpin = approving ? (record.ulpin ?? generateUlpin()) : record.ulpin;

  await db.$transaction([
    db.extractedRecord.update({
      where: { documentId: id },
      data: {
        ownerName: corrected.ownerName, surveyNumber: corrected.surveyNumber,
        khasraNumber: corrected.khasraNumber, khataNumber: corrected.khataNumber,
        plotArea: corrected.plotArea, village: corrected.village,
        tehsil: corrected.tehsil, district: corrected.district,
        landClassification: corrected.landClassification,
        confidence: toJson(confidence),
        ulpin,
      },
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

    // One row per corrected field — an auditor should see exactly what
    // changed, not a single opaque "edited" entry.
    ...edits.map((edit) =>
      db.auditLog.create({
        data: {
          documentId: id,
          actorId: guard.actor.id,
          action: "EDIT_FIELD",
          before: toJson({ field: FIELD_LABELS[edit.field], value: edit.before }),
          after: toJson({ field: FIELD_LABELS[edit.field], value: edit.after }),
        },
      }),
    ),

    db.auditLog.create({
      data: {
        documentId: id,
        actorId: guard.actor.id,
        action: approving ? "APPROVE" : "REJECT",
        before: toJson({ status: document.status }),
        after: toJson({
          status,
          ...(approving ? { ulpin } : {}),
          fieldsCorrected: edits.length,
        }),
      },
    }),
  ]);

  // Remember every substitution the officer made, so the pipeline stops
  // repeating that misreading on the next page that carries it. Deliberately
  // outside the transaction above: failing to learn must never roll back a
  // verification a person has already committed.
  await Promise.all(
    edits.map((edit) => learnCorrection(edit.field, edit.before, edit.after)),
  ).catch(() => {});

  const response: VerifyResponse = { documentId: id, status };
  return NextResponse.json(response);
}
