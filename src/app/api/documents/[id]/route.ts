import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireSession } from "@/lib/api-auth";
import { fromJson } from "@/lib/json";
import type {
  ConfidenceMap,
  DocumentDetailResponse,
  ExtractedFields,
  ValidationIssue,
} from "@/types";

/** GET /api/documents/[id] — readable by any signed-in role. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const guard = await requireSession();
  if (!guard.ok) return guard.response;

  const { id } = await params;

  const document = await db.document.findUnique({
    where: { id },
    include: { record: true, validation: true },
  });

  if (!document) {
    return NextResponse.json({ error: "Document not found" }, { status: 404 });
  }

  const record = document.record;

  // Always return the full field set, nulls included, so the frontend never
  // has to guess whether a key is absent or genuinely empty.
  const extractedFields: ExtractedFields = {
    ownerName: record?.ownerName ?? null,
    surveyNumber: record?.surveyNumber ?? null,
    khasraNumber: record?.khasraNumber ?? null,
    khataNumber: record?.khataNumber ?? null,
    plotArea: record?.plotArea ?? null,
    village: record?.village ?? null,
    tehsil: record?.tehsil ?? null,
    district: record?.district ?? null,
    landClassification: record?.landClassification ?? null,
    ulpin: record?.ulpin ?? null,
  };

  const body: DocumentDetailResponse = {
    documentId: document.id,
    filename: document.filename,
    filePath: document.filePath,
    status: document.status,
    extractedFields,
    confidence: fromJson<ConfidenceMap>(record?.confidence, {}),
    validation: document.validation
      ? {
          status: document.validation.status,
          issues: fromJson<ValidationIssue[]>(document.validation.issues, []),
          duplicateOf: document.validation.duplicateOfId,
        }
      : null,
  };

  return NextResponse.json(body);
}
