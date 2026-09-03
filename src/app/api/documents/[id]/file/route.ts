import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireSession } from "@/lib/api-auth";
import { CONTENT_TYPE_BY_EXTENSION, resolveStoredPath } from "@/lib/files";

/**
 * GET /api/documents/[id]/file — serves a document's scan.
 *
 * Next.js only serves /public statically, and scans must not live there: these
 * are land records, not public assets. This route gates them behind a session.
 *
 * Addressed by document id rather than by path, so the only files reachable
 * are ones a Document row already points at — there is no user-supplied path
 * to traverse. resolveStoredPath is a second check on top of that.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const guard = await requireSession();
  if (!guard.ok) return guard.response;

  const { id } = await params;

  const document = await db.document.findUnique({
    where: { id },
    select: { filePath: true, filename: true },
  });

  if (!document?.filePath) {
    return NextResponse.json({ error: "Document not found" }, { status: 404 });
  }

  const absolute = resolveStoredPath(document.filePath);
  if (!absolute) {
    console.error(`Refusing to serve out-of-tree path: ${document.filePath}`);
    return NextResponse.json({ error: "Document not found" }, { status: 404 });
  }

  let bytes: Buffer;
  try {
    bytes = await readFile(absolute);
  } catch {
    return NextResponse.json({ error: "Scan file is missing" }, { status: 404 });
  }

  const extension = path.extname(absolute).toLowerCase();
  const contentType =
    CONTENT_TYPE_BY_EXTENSION[extension] ?? "application/octet-stream";

  return new NextResponse(new Uint8Array(bytes), {
    headers: {
      "Content-Type": contentType,
      // Scans are displayed, never executed. `sandbox` neutralises script in an
      // SVG; nosniff stops a mislabelled file being re-interpreted.
      "Content-Security-Policy": "sandbox; default-src 'none'; style-src 'unsafe-inline'",
      "X-Content-Type-Options": "nosniff",
      "Content-Disposition": `inline; filename="${encodeURIComponent(document.filename)}"`,
      "Cache-Control": "private, max-age=300",
    },
  });
}
