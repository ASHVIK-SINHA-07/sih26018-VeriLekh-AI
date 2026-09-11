import Link from "next/link";
import { db } from "@/lib/db";
import { fromJson } from "@/lib/json";
import { AuditTrail } from "@/components/audit-trail";
import { ChainPanel } from "@/components/chain-panel";
import { ProvenanceNote } from "@/components/quality-panel";
import { loadParcelHistory } from "@/lib/evidence";
import { verifyDocumentChain } from "@/lib/audit";
import {
  MUTATION_FIELD_LABELS, MUTATION_FIELD_NAMES, validateMutationOrder,
  type MutationConfidence, type MutationFields,
} from "@/lib/mutation-order";
import type { AuditLogEntry, ValidationIssue, ValidationSummary } from "@/types";
import { VerifyClient } from "./verify-client";

/**
 * The review screen for a दाखिल-खारिज order.
 *
 * Same shape as a khatauni's — scan beside the fields, approve or reject —
 * but approving means something different: the order becomes an entry in the
 * parcel's register. So below the fields the reviewer sees the chain of title
 * *as it would stand if they approve*, with the proposed entry marked and any
 * defect it would introduce named on it. What they see is what they sign.
 */
export async function MutationOrderView({ documentId }: { documentId: string }) {
  const document = await db.document.findUniqueOrThrow({
    where: { id: documentId },
    include: {
      mutation: true,
      validation: true,
      auditLogs: {
        orderBy: { timestamp: "asc" },
        include: { actor: { select: { name: true, role: true } } },
      },
    },
  });

  const reading = document.mutation;
  if (!reading) {
    return (
      <section className="space-y-4 p-4 sm:p-7">
        <Link href="/verify" className="text-sm text-navy underline underline-offset-2">← Back to queue</Link>
        <h1 className="text-xl font-medium text-navy">{document.filename}</h1>
        <p className="text-sm text-muted-foreground">This order has not been read yet, so there is nothing to review.</p>
      </section>
    );
  }

  const fields = Object.fromEntries(MUTATION_FIELD_NAMES.map((f) => [f, reading[f]])) as MutationFields;
  const confidence = fromJson<MutationConfidence>(reading.confidence, {});
  const decided = document.status === "VERIFIED" || document.status === "REJECTED";

  const history = await loadParcelHistory(fields);
  const checked = validateMutationOrder({ fields, confidence, existing: history.rows });

  // While undecided, the findings are recomputed against the register as it
  // stands now — another order may have been approved since this one was
  // read. Once decided, what was recorded at the decision is what stands.
  const validation: ValidationSummary = decided && document.validation
    ? {
        status: document.validation.status,
        issues: fromJson<ValidationIssue[]>(document.validation.issues, []),
        duplicateOf: null,
      }
    : { status: checked.status, issues: checked.issues, duplicateOf: null };

  const provenance = await verifyDocumentChain(document.id);
  const auditEntries: AuditLogEntry[] = document.auditLogs.map((entry) => ({
    id: entry.id,
    action: entry.action,
    actorName: entry.actor.name,
    actorRole: entry.actor.role,
    before: entry.before,
    after: entry.after,
    timestamp: entry.timestamp.toISOString(),
  }));

  let chainPanel: React.ReactNode;
  if (document.status === "VERIFIED") {
    chainPanel = (
      <ChainPanel
        chain={checked.before}
        khasra={fields.khasraNumber}
        highlightId={reading.mutationId}
        currentDocumentId={document.id}
        note="This order has been approved — it is the marked entry in the parcel's register below."
      />
    );
  } else if (document.status === "REJECTED") {
    chainPanel = (
      <ChainPanel
        chain={checked.before}
        khasra={fields.khasraNumber}
        note="This order was rejected and never entered the register."
      />
    );
  } else if (checked.after) {
    chainPanel = (
      <ChainPanel
        chain={checked.after}
        khasra={fields.khasraNumber}
        title="Chain of title if this order is approved"
        highlightId="proposed"
        currentDocumentId={document.id}
        note={
          checked.before.status === "EMPTY"
            ? "Preview. No history for this parcel is on record yet — approving this order would begin it."
            : "Preview. Nothing has entered the register yet — the proposed entry is marked."
        }
      />
    );
  } else {
    chainPanel = (
      <ChainPanel
        chain={checked.before}
        khasra={fields.khasraNumber}
        note="This order cannot be previewed against the chain until its type of transfer, date, share and transferee can be read."
      />
    );
  }

  return (
    <div>
      <VerifyClient
        documentId={document.id}
        filename={document.filename}
        filePath={document.filePath}
        status={document.status}
        fieldNames={MUTATION_FIELD_NAMES}
        fieldLabels={MUTATION_FIELD_LABELS}
        fields={{ ...fields }}
        confidence={confidence}
        validation={validation}
        duplicateOf={null}
        fieldsTitle="Read from the mutation order"
        approveHint="Approving enters this order in the parcel's mutation register — its chain of title updates at once."
      />
      <div className="space-y-4 px-4 pb-4 sm:px-7 sm:pb-7">
        {chainPanel}
        <ProvenanceNote chain={provenance} framed />
        <AuditTrail entries={auditEntries} />
      </div>
    </div>
  );
}
