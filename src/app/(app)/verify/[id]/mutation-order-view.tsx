import Link from "next/link";
import { db } from "@/lib/db";
import { fromJson } from "@/lib/json";
import { AuditTrail } from "@/components/audit-trail";
import { ChainPanel } from "@/components/chain-panel";
import { ProvenanceNote } from "@/components/quality-panel";
import { loadParcelHistory } from "@/lib/evidence";
import { verifyDocumentChain } from "@/lib/audit";
import {
  MUTATION_FIELD_NAMES, validateMutationOrder,
  type MutationConfidence, type MutationFields,
} from "@/lib/mutation-order";
import type { AuditLogEntry, ValidationIssue, ValidationSummary } from "@/types";
import { VerifyClient } from "./verify-client";
import { getI18n } from "@/i18n/server";
import { renderFinding } from "@/i18n/translate";

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

  const { t, locale } = await getI18n();
  const reading = document.mutation;
  if (!reading) {
    return (
      <section className="space-y-4 p-4 sm:p-7">
        <Link href="/verify" className="text-sm text-navy underline underline-offset-2">{t("verify.back")}</Link>
        <h1 className="text-xl font-medium text-navy">{document.filename}</h1>
        <p className="text-sm text-muted-foreground">{t("verify.orderNotRead")}</p>
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
        note={t("chain.noteApproved")}
      />
    );
  } else if (document.status === "REJECTED") {
    chainPanel = (
      <ChainPanel
        chain={checked.before}
        khasra={fields.khasraNumber}
        note={t("chain.noteRejected")}
      />
    );
  } else if (checked.after) {
    chainPanel = (
      <ChainPanel
        chain={checked.after}
        khasra={fields.khasraNumber}
        title={t("chain.titleIfApproved")}
        highlightId="proposed"
        currentDocumentId={document.id}
        note={
          checked.before.status === "EMPTY"
            ? t("chain.notePreviewEmpty")
            : t("chain.notePreview")
        }
      />
    );
  } else {
    chainPanel = (
      <ChainPanel
        chain={checked.before}
        khasra={fields.khasraNumber}
        note={t("chain.noteCannotPreview")}
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
        fieldLabels={Object.fromEntries(MUTATION_FIELD_NAMES.map((f) => [f, t(`orderFields.${f}`)]))}
        fields={{ ...fields }}
        confidence={confidence}
        validation={validation}
        issueTexts={validation.issues.map((issue) => renderFinding(t, locale, issue))}
        duplicateOf={null}
        fieldsTitle={t("verify.orderFieldsTitle")}
        approveHint={t("verify.approveHintOrder")}
      />
      <div className="space-y-4 px-4 pb-4 sm:px-7 sm:pb-7">
        {chainPanel}
        <ProvenanceNote chain={provenance} framed />
        <AuditTrail entries={auditEntries} />
      </div>
    </div>
  );
}
