import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireSession } from "@/lib/api-auth";
import { isValidUlpin } from "@/lib/ulpin";
import type { NgdrsMockResponse } from "@/types";

/**
 * GET /api/mock/ngdrs/[ulpin] — SIMULATED registry integration.
 *
 * This is a stand-in for a real NGDRS/DILRMP submission, which is explicitly
 * out of scope (docs/01_PRD.md). It makes no network call to any government
 * system and never will in this build.
 *
 * The response is assembled from this database's own verified record, looked
 * up by its ULPIN — it is not a canned fixture. So the shape a real
 * integration would receive is demonstrated with genuine data, and a record
 * that does not exist, or has not been approved by a person, is refused
 * rather than invented.
 *
 * Every response is stamped SIMULATED at the top level and carries an explicit
 * disclaimer. Nothing here should ever be mistakable for a real registry call.
 */

const SIMULATION_NOTICE =
  "SIMULATED RESPONSE. Generated locally by the land record digitization " +
  "system for demonstration. No request was made to NGDRS, DILRMP or any " +
  "government registry, and this payload has no legal standing.";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ ulpin: string }> },
) {
  // Gated like every other endpoint: this returns ownership data, and the
  // whole premise is that such data stays behind authentication.
  const guard = await requireSession();
  if (!guard.ok) return guard.response;

  const { ulpin } = await params;

  if (!isValidUlpin(ulpin)) {
    return NextResponse.json(
      {
        status: "SIMULATED",
        error: "Not a well-formed ULPIN-style identifier",
        expectedFormat: "Two-letter state code followed by 12 hex characters",
        disclaimer: SIMULATION_NOTICE,
      },
      { status: 400 },
    );
  }

  const record = await db.extractedRecord.findUnique({
    where: { ulpin },
    include: {
      document: {
        select: {
          filename: true,
          status: true,
          createdAt: true,
          auditLogs: {
            where: { action: "APPROVE" },
            orderBy: { timestamp: "desc" },
            take: 1,
            select: { timestamp: true, actor: { select: { name: true, role: true } } },
          },
        },
      },
    },
  });

  if (!record) {
    return NextResponse.json(
      {
        status: "SIMULATED",
        error: "No record in this system carries that ULPIN",
        disclaimer: SIMULATION_NOTICE,
      },
      { status: 404 },
    );
  }

  // A ULPIN is only minted on approval, so this should not happen — but if a
  // record is ever un-verified, refuse rather than emit an unapproved parcel.
  if (record.document.status !== "VERIFIED") {
    return NextResponse.json(
      {
        status: "SIMULATED",
        error: "That record is not in a verified state and cannot be submitted",
        currentStatus: record.document.status,
        disclaimer: SIMULATION_NOTICE,
      },
      { status: 409 },
    );
  }

  const approval = record.document.auditLogs[0];
  const area = record.plotArea ? Number.parseFloat(record.plotArea) : null;

  const body: NgdrsMockResponse = {
    ulpin: record.ulpin as string,
    status: "SIMULATED",
    registrySnapshot: {
      disclaimer: SIMULATION_NOTICE,
      submission: {
        // Deterministic from the ULPIN so the same record always shows the
        // same reference — a random one each call would look like a real
        // transaction id and mislead.
        acknowledgementRef: `SIM-${record.ulpin}`,
        acceptedAt: new Date().toISOString(),
        targetSystem: "NGDRS (simulated endpoint — no external call made)",
        schemaVersion: "ngdrs-parcel/0.1-simulated",
      },
      parcel: {
        khasraNumber: record.khasraNumber,
        khataNumber: record.khataNumber,
        surveyNumber: record.surveyNumber,
        area: area === null || Number.isNaN(area)
          ? null
          : { value: area, unit: "hectare" },
        classification: record.landClassification,
      },
      location: {
        village: record.village,
        tehsil: record.tehsil,
        district: record.district,
        state: "Uttar Pradesh",
      },
      holder: {
        name: record.ownerName,
        // Deliberately absent: this system digitizes the register as written,
        // and never infers identity data that is not on the page.
        identityDocuments: [],
      },
      provenance: {
        sourceDocument: record.document.filename,
        digitizedOn: record.document.createdAt.toISOString(),
        verifiedBy: approval
          ? { name: approval.actor.name, role: approval.actor.role }
          : null,
        verifiedOn: approval ? approval.timestamp.toISOString() : null,
        extractionConfidence: record.confidence,
      },
    },
  };

  return NextResponse.json(body, {
    headers: { "X-Simulated-Response": "true" },
  });
}
