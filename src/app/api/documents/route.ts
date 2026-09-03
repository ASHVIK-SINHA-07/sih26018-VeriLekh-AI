import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { CAN_WRITE, requireRole, requireSession } from "@/lib/api-auth";
import { saveUpload } from "@/lib/files";
import {
  ACCEPTED_UPLOAD_TYPES,
  MAX_UPLOAD_BYTES,
  type DocumentListResponse,
  type DocumentStatus,
  type UploadResponse,
} from "@/types";

const VALID_STATUSES: DocumentStatus[] = [
  "UPLOADED", "PROCESSING", "PENDING", "VERIFIED", "FLAGGED", "REJECTED",
];

/**
 * GET /api/documents?status=&district=
 * Readable by any signed-in role — a Viewer needs it for the dashboard.
 */
export async function GET(request: NextRequest) {
  const guard = await requireSession();
  if (!guard.ok) return guard.response;

  const params = request.nextUrl.searchParams;
  const status = params.get("status");
  const district = params.get("district");

  const documents = await db.document.findMany({
    where: {
      ...(status && VALID_STATUSES.includes(status as DocumentStatus)
        ? { status: status as DocumentStatus }
        : {}),
      ...(district ? { record: { district } } : {}),
    },
    include: { record: { select: { district: true } } },
    orderBy: { updatedAt: "desc" },
  });

  const body: DocumentListResponse = {
    documents: documents.map((document) => ({
      id: document.id,
      filename: document.filename,
      status: document.status,
      district: document.record?.district ?? null,
      updatedAt: document.updatedAt.toISOString(),
    })),
  };

  return NextResponse.json(body);
}

/**
 * POST /api/documents  (multipart: file)
 *
 * Saves the scan, creates the Document, and writes the UPLOAD audit row.
 * One file per request; the upload screen loops for a batch, which keeps the
 * response shape in doc 02 honest (`{ documentId, status }`, singular).
 */
export async function POST(request: NextRequest) {
  const guard = await requireRole(CAN_WRITE);
  if (!guard.ok) return guard.response;

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json(
      { error: "Expected a multipart form containing a file" },
      { status: 400 },
    );
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }

  if (!ACCEPTED_UPLOAD_TYPES.includes(file.type as (typeof ACCEPTED_UPLOAD_TYPES)[number])) {
    return NextResponse.json(
      { error: `Unsupported file type "${file.type || "unknown"}". Accepted: JPG, PNG, PDF.` },
      { status: 415 },
    );
  }

  if (file.size === 0) {
    return NextResponse.json({ error: "File is empty" }, { status: 400 });
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return NextResponse.json(
      { error: `File exceeds the ${Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)} MB limit` },
      { status: 413 },
    );
  }

  // Create the row first so the stored filename can be derived from its id.
  const document = await db.document.create({
    data: {
      filename: file.name,
      filePath: "",
      status: "UPLOADED",
      uploadedById: guard.actor.id,
    },
  });

  const filePath = await saveUpload(
    document.id,
    await file.arrayBuffer(),
    file.type,
    file.name,
  );

  await db.document.update({ where: { id: document.id }, data: { filePath } });

  // Every data-changing action writes an audit row — CLAUDE.md, doc 03.
  await db.auditLog.create({
    data: {
      documentId: document.id,
      actorId: guard.actor.id,
      action: "UPLOAD",
      after: { filename: file.name, size: file.size, mimeType: file.type },
    },
  });

  const body: UploadResponse = { documentId: document.id, status: "UPLOADED" };
  return NextResponse.json(body, { status: 201 });
}
