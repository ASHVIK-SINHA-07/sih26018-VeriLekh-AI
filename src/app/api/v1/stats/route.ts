import { NextResponse, type NextRequest } from "next/server";
import { requireReader, API_NOTICE } from "@/lib/api-auth";
import { getDashboardStats } from "@/lib/stats";

/**
 * GET /api/v1/stats?district=
 *
 * The dashboard's figures, for a state or national dashboard to aggregate:
 * documents processed, extraction accuracy, validation results, pending and
 * flagged work, and progress by state and district.
 */

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const guard = await requireReader(request);
  if (!guard.ok) return guard.response;

  const stats = await getDashboardStats(request.nextUrl.searchParams.get("district"));
  return NextResponse.json({
    notice: API_NOTICE,
    documentsProcessed: stats.totalProcessed,
    extractionAccuracy: stats.fieldAccuracy,
    meanQuality: stats.avgQuality,
    pendingVerification: stats.pendingVerification,
    flagged: stats.flagged,
    validation: stats.validation,
    byState: stats.byState,
    byDistrict: stats.byDistrict,
  });
}
