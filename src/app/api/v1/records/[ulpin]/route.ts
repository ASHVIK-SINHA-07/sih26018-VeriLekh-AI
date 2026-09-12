import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { requireReader, API_NOTICE } from "@/lib/api-auth";
import { verifyDocumentChain } from "@/lib/audit";
import { loadParcelHistory } from "@/lib/evidence";

/**
 * GET /api/v1/records/{ulpin}
 *
 * One approved record, with what another system needs to trust it: its
 * fields, its quality score, when it was approved, whether its audit trail
 * still verifies, and the parcel's ownership history with the registration
 * reference each transfer rests on.
 */

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, { params }: { params: Promise<{ ulpin: string }> }) {
  const guard = await requireReader(request);
  if (!guard.ok) return guard.response;

  const { ulpin } = await params;
  const record = await db.extractedRecord.findUnique({
    where: { ulpin: ulpin.trim().toUpperCase() },
    include: { document: { select: { status: true } } },
  });
  if (!record || record.document.status !== "VERIFIED") {
    return NextResponse.json({ error: "No approved record with that reference" }, { status: 404 });
  }

  const [approval, audit, history] = await Promise.all([
    db.auditLog.findFirst({
      where: { documentId: record.documentId, action: "APPROVE" },
      orderBy: { timestamp: "desc" },
      select: { timestamp: true },
    }),
    verifyDocumentChain(record.documentId),
    loadParcelHistory({ khasraNumber: record.khasraNumber, village: record.village, district: record.district }),
  ]);

  // Corrections replace the entry they supersede; list what stands.
  const superseded = new Set(history.rows.map((m) => m.supersedesId).filter(Boolean));
  const ownershipHistory = history.rows
    .filter((m) => !superseded.has(m.id))
    .sort((a, b) => a.effectiveDate.getTime() - b.effectiveDate.getTime() || a.seq - b.seq)
    .map((m) => ({
      entry: m.seq,
      date: m.effectiveDate.toISOString().slice(0, 10),
      type: m.type,
      from: m.fromOwner,
      to: m.toOwner,
      share: m.share,
      mutationNumber: m.mutationNumber,
      registration: m.orderReference ?? null,
    }));

  return NextResponse.json({
    notice: API_NOTICE,
    ulpin: record.ulpin,
    fields: {
      ownerName: record.ownerName,
      surveyNumber: record.surveyNumber,
      khasraNumber: record.khasraNumber,
      khataNumber: record.khataNumber,
      plotArea: record.plotArea,
      village: record.village,
      tehsil: record.tehsil,
      district: record.district,
      landClassification: record.landClassification,
    },
    qualityScore: record.qualityScore,
    approvedAt: approval?.timestamp.toISOString() ?? null,
    auditTrail: { entries: audit.entries, intact: audit.intact },
    ownershipHistory,
  });
}
