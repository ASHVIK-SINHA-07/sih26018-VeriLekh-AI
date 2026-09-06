import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { CAN_WRITE, requireRole } from "@/lib/api-auth";
import { enqueue, queueDepth } from "@/lib/queue";
import { runExtraction } from "@/lib/pipeline";

/**
 * POST /api/documents/[id]/extract
 *
 * Queues the document for extraction and returns immediately with 202.
 * Reading a page costs seconds of CPU, so doing it inside this request would
 * hold a server thread per page — a 200-page register uploaded as a batch
 * would exhaust the pool and start timing out. A worker process drains the
 * queue instead, and the caller polls GET /api/documents/[id] for the status.
 *
 * `?wait=1` runs it inline instead, for scripts and tests that want the
 * result in one call. Never used by the screens.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const guard = await requireRole(CAN_WRITE);
  if (!guard.ok) return guard.response;

  const { id } = await params;

  const document = await db.document.findUnique({ where: { id } });
  if (!document) {
    return NextResponse.json({ error: "Document not found" }, { status: 404 });
  }

  if (request.nextUrl.searchParams.get("wait") === "1") {
    try {
      await db.document.update({ where: { id }, data: { status: "PROCESSING" } });
      return NextResponse.json(await runExtraction(id));
    } catch (error) {
      // Never strand a document in PROCESSING with nothing working on it.
      await db.document.update({ where: { id }, data: { status: "UPLOADED" } });
      console.error(`Inline extraction failed for ${id}:`, error);
      return NextResponse.json(
        { error: "Extraction failed. The document has been returned to uploaded." },
        { status: 502 },
      );
    }
  }

  const jobId = await enqueue(id);
  const depth = await queueDepth();

  return NextResponse.json(
    {
      documentId: id,
      status: "PROCESSING",
      jobId,
      queuePosition: depth.queued,
      message: "Queued for extraction. Poll this document for its status.",
    },
    { status: 202 },
  );
}
