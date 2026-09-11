import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { fromJson } from "@/lib/json";
import { AuditTrail } from "@/components/audit-trail";
import { QualityPanel } from "@/components/quality-panel";
import { ReconciliationPanel } from "@/components/reconciliation-panel";
import { reconcile, reconciliationIssues, type AuthoritativeRow, type SourceName } from "@/lib/reconcile";
import { scoreRecord } from "@/lib/quality";
import { verifyDocumentChain } from "@/lib/audit";
import { VerifyClient } from "./verify-client";
import type {
  AuditLogEntry, ConfidenceMap, ExtractedFields, ValidationIssue, ValidationSummary,
} from "@/types";

export const dynamic = "force-dynamic";

/** Screen 3 (detail) in docs/04_Frontend_Spec.md. */
export default async function VerifyDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (session.user.role === "VIEWER") redirect("/dashboard");

  const { id } = await params;

  const document = await db.document.findUnique({
    where: { id },
    include: {
      record: true,
      validation: true,
      auditLogs: {
        orderBy: { timestamp: "asc" },
        include: { actor: { select: { name: true, role: true } } },
      },
    },
  });

  if (!document) notFound();

  const record = document.record;

  if (!record) {
    return (
      <section className="space-y-4">
        <Link href="/verify" className="text-sm text-navy underline underline-offset-2">
          ← Back to queue
        </Link>
        <h1 className="text-xl font-medium text-navy">{document.filename}</h1>
        <p className="text-sm text-muted-foreground">
          This document has not been read yet, so there is nothing to review.
          Run extraction from the upload screen first.
        </p>
      </section>
    );
  }

  const fields: ExtractedFields = {
    ownerName: record.ownerName, surveyNumber: record.surveyNumber,
    khasraNumber: record.khasraNumber, khataNumber: record.khataNumber,
    plotArea: record.plotArea, village: record.village, tehsil: record.tehsil,
    district: record.district, landClassification: record.landClassification,
    ulpin: record.ulpin,
  };

  const validation: ValidationSummary | null = document.validation
    ? {
        status: document.validation.status,
        issues: fromJson<ValidationIssue[]>(document.validation.issues, []),
        duplicateOf: document.validation.duplicateOfId,
      }
    : null;

  // Resolve the duplicate pointer to something a person can actually read.
  let duplicateOf: { id: string; filename: string; ulpin: string | null } | null = null;
  if (validation?.duplicateOf) {
    const other = await db.document.findUnique({
      where: { id: validation.duplicateOf },
      select: { id: true, filename: true, record: { select: { ulpin: true } } },
    });
    if (other) {
      duplicateOf = { id: other.id, filename: other.filename, ulpin: other.record?.ulpin ?? null };
    }
  }

  const auditEntries: AuditLogEntry[] = document.auditLogs.map((entry) => ({
    id: entry.id,
    action: entry.action,
    actorName: entry.actor.name,
    actorRole: entry.actor.role,
    before: entry.before,
    after: entry.after,
    timestamp: entry.timestamp.toISOString(),
  }));

  // Scored on read rather than trusted from the column: the stored number is
  // for ranking on the dashboard, but the reviewer looking at this page should
  // see a score derived from exactly the record and findings in front of them.
  const chain = await verifyDocumentChain(document.id);

  // What the other government systems hold for this parcel. Narrowed by
  // khasra first so a district-wide scan never loads every row.
  const sourceRows = fields.khasraNumber
    ? await db.authoritativeRecord.findMany({ where: { khasraNumber: fields.khasraNumber } })
    : [];
  const reconciliation = reconcile({
    fields,
    sources: sourceRows.map((r): AuthoritativeRow => ({
      source: r.source as SourceName,
      khasraNumber: r.khasraNumber,
      village: r.village,
      district: r.district,
      ownerName: r.ownerName,
      khataNumber: r.khataNumber,
      plotArea: r.plotArea,
      landClassification: r.landClassification,
      asOf: r.asOf,
    })),
  });

  // Scored last, against both our own findings and what other systems hold —
  // a record the rest of government disagrees with is not a clean record,
  // and the two panels must not tell the reviewer different stories.
  const quality = scoreRecord({
    fields,
    confidence: fromJson<ConfidenceMap>(record.confidence, {}),
    issues: [...(validation?.issues ?? []), ...reconciliationIssues(reconciliation)],
  });

  return (
    <div>
    <VerifyClient
      documentId={document.id}
      filename={document.filename}
      filePath={document.filePath}
      status={document.status}
      fields={fields}
      confidence={fromJson<ConfidenceMap>(record.confidence, {})}
      validation={validation}
      duplicateOf={duplicateOf}
    />
    <div className="space-y-4 px-4 pb-4 sm:px-7 sm:pb-7">
      <QualityPanel quality={quality} chain={chain} />
      <ReconciliationPanel result={reconciliation} />
      <AuditTrail entries={auditEntries} />
    </div>
    </div>
  );
}
