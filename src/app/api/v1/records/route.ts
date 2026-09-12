import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { requireReader, API_NOTICE } from "@/lib/api-auth";

/**
 * GET /api/v1/records?district=&limit=&cursor=
 *
 * Approved Records of Rights, for another government system to read. Only
 * records a revenue officer has approved are listed — a reading still under
 * review is not a record yet. Read-only: nothing under /api/v1 writes.
 */

export const dynamic = "force-dynamic";

const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 100;

export async function GET(request: NextRequest) {
  const guard = await requireReader(request);
  if (!guard.ok) return guard.response;

  const params = request.nextUrl.searchParams;
  const district = params.get("district")?.trim() || undefined;
  const limit = Math.min(MAX_LIMIT, Math.max(1, Number(params.get("limit")) || DEFAULT_LIMIT));
  const cursor = params.get("cursor") || undefined;

  const rows = await db.extractedRecord.findMany({
    where: { ulpin: { not: null }, document: { status: "VERIFIED" }, ...(district ? { district } : {}) },
    orderBy: { id: "asc" },
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    include: { document: { select: { updatedAt: true } } },
  });

  const page = rows.slice(0, limit);
  return NextResponse.json({
    notice: API_NOTICE,
    records: page.map((r) => ({
      ulpin: r.ulpin,
      ownerName: r.ownerName,
      surveyNumber: r.surveyNumber,
      khasraNumber: r.khasraNumber,
      khataNumber: r.khataNumber,
      plotArea: r.plotArea,
      village: r.village,
      tehsil: r.tehsil,
      district: r.district,
      landClassification: r.landClassification,
      qualityScore: r.qualityScore,
      updatedAt: r.document.updatedAt.toISOString(),
    })),
    nextCursor: rows.length > limit ? page[page.length - 1].id : null,
  });
}
