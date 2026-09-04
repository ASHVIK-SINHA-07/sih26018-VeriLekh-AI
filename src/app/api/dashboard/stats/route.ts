import { NextResponse, type NextRequest } from "next/server";
import { requireSession } from "@/lib/api-auth";
import { getDashboardStats } from "@/lib/stats";

/**
 * GET /api/dashboard/stats?district=
 * Readable by every signed-in role — a Viewer's whole job is this screen.
 */
export async function GET(request: NextRequest) {
  const guard = await requireSession();
  if (!guard.ok) return guard.response;

  const district = request.nextUrl.searchParams.get("district");
  return NextResponse.json(await getDashboardStats(district));
}
