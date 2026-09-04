"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/status-badge";
import { FieldEditor } from "@/components/field-editor";
import { NgdrsPanel } from "@/components/ngdrs-panel";
import {
  EXTRACTED_FIELD_NAMES,
  FIELD_LABELS,
  type ConfidenceMap,
  type DocumentStatus,
  type ExtractedFieldName,
  type ExtractedFields,
  type ValidationSummary,
} from "@/types";

/**
 * Scan and fields side by side — docs/04_Frontend_Spec.md screen 3.
 *
 * Only fields the verifier actually changed are sent as `editedFields`, so the
 * audit trail records real corrections rather than a diff of every field on
 * the form.
 */

interface Props {
  documentId: string;
  filename: string;
  filePath: string;
  status: DocumentStatus;
  fields: ExtractedFields;
  confidence: ConfidenceMap;
  validation: ValidationSummary | null;
  duplicateOf: { id: string; filename: string; ulpin: string | null } | null;
}

const DECIDED: DocumentStatus[] = ["VERIFIED", "REJECTED"];

export function VerifyClient(props: Props) {
  const router = useRouter();
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      EXTRACTED_FIELD_NAMES.map((field) => [field, props.fields[field] ?? ""]),
    ),
  );
  const [submitting, setSubmitting] = useState<null | "approve" | "reject">(null);
  const [error, setError] = useState<string | null>(null);

  const decided = DECIDED.includes(props.status);

  const edited = useMemo(() => {
    const changed = new Set<ExtractedFieldName>();
    for (const field of EXTRACTED_FIELD_NAMES) {
      const original = props.fields[field] ?? "";
      if (values[field].trim() !== original.trim()) changed.add(field);
    }
    return changed;
  }, [values, props.fields]);

  async function submit(action: "approve" | "reject") {
    setSubmitting(action);
    setError(null);

    const editedFields: Partial<Record<ExtractedFieldName, string>> = {};
    for (const field of edited) editedFields[field] = values[field];

    try {
      const response = await fetch(`/api/documents/${props.documentId}/verify`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          ...(edited.size > 0 ? { editedFields } : {}),
        }),
      });

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        setError(body.error ?? "Could not save this decision");
        setSubmitting(null);
        return;
      }

      // Back to the queue, which will no longer contain this record.
      router.push("/verify");
      router.refresh();
    } catch {
      setError("Network error — the decision was not saved");
      setSubmitting(null);
    }
  }

  const isPdf = props.filePath.toLowerCase().endsWith(".pdf");
  const scanUrl = `/api/documents/${props.documentId}/file`;

  return (
    <section className="space-y-5">
      {/* ------------------------------------------------------------ header */}
      <div className="flex flex-wrap items-center gap-3">
        <Link href="/verify" className="text-sm text-navy underline underline-offset-2">
          ← Back to queue
        </Link>
        <span className="text-muted-foreground">·</span>
        <h1 className="text-lg font-medium text-navy">{props.filename}</h1>
        <StatusBadge status={props.status} />
        {props.fields.ulpin ? (
          <span className="font-mono text-xs text-muted-foreground">
            {props.fields.ulpin}
          </span>
        ) : null}
      </div>

      {/* -------------------------------------------------- validation banner */}
      {props.validation && props.validation.issues.length > 0 ? (
        <div
          className={`rounded-lg border px-4 py-3 ${
            props.validation.status === "DUPLICATE"
              ? "border-status-flagged/40 bg-status-flagged/5"
              : "border-low-confidence/40 bg-low-confidence/5"
          }`}
        >
          <p className="text-sm font-medium text-foreground">
            {props.validation.status === "DUPLICATE"
              ? "This looks like a parcel that is already recorded"
              : `${props.validation.issues.length} thing${props.validation.issues.length === 1 ? "" : "s"} to check before approving`}
          </p>
          <ul className="mt-2 space-y-1">
            {props.validation.issues.map((issue, index) => (
              <li key={`${issue.field}-${index}`} className="text-sm text-muted-foreground">
                · {issue.issue}
              </li>
            ))}
          </ul>
          {props.duplicateOf ? (
            <p className="mt-2 text-sm">
              <Link
                href={`/verify/${props.duplicateOf.id}`}
                className="text-navy underline underline-offset-2"
              >
                Open the existing record ({props.duplicateOf.filename})
              </Link>
            </p>
          ) : null}
        </div>
      ) : null}

      {/* --------------------------------- simulated registry push (T9) */}
      {props.status === "VERIFIED" && props.fields.ulpin ? (
        <NgdrsPanel ulpin={props.fields.ulpin} />
      ) : null}

      {/* ------------------------------------------------------ two columns */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* left: the scan */}
        <div className="space-y-2">
          <h2 className="text-sm font-medium text-navy">Scanned record</h2>
          <div className="overflow-hidden rounded-lg border border-border bg-white">
            {isPdf ? (
              <object
                data={scanUrl}
                type="application/pdf"
                className="h-[36rem] w-full"
                aria-label={`Scan of ${props.filename}`}
              >
                <p className="p-4 text-sm text-muted-foreground">
                  This PDF cannot be shown inline.{" "}
                  <a href={scanUrl} className="text-navy underline">Open it directly</a>.
                </p>
              </object>
            ) : (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={scanUrl}
                alt={`Scan of ${props.filename}`}
                className="w-full object-contain"
              />
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            Faded areas on the scan are where the reader was least certain.
          </p>
        </div>

        {/* right: the fields */}
        <div className="space-y-4">
          <div className="flex items-baseline justify-between">
            <h2 className="text-sm font-medium text-navy">Extracted fields</h2>
            {edited.size > 0 ? (
              <span className="text-xs text-status-verified">
                {edited.size} field{edited.size === 1 ? "" : "s"} corrected
              </span>
            ) : null}
          </div>

          <div className="space-y-4 rounded-lg border border-border bg-white p-4">
            {EXTRACTED_FIELD_NAMES.map((field) => (
              <FieldEditor
                key={field}
                name={field}
                label={FIELD_LABELS[field]}
                value={values[field]}
                confidence={props.confidence[field]}
                edited={edited.has(field)}
                disabled={decided || submitting !== null}
                onChange={(next) =>
                  setValues((current) => ({ ...current, [field]: next }))
                }
              />
            ))}
          </div>

          {error ? (
            <p role="alert" className="text-sm text-status-flagged">{error}</p>
          ) : null}

          {/* ------------------------------------------------------ actions */}
          {decided ? (
            <p className="text-sm text-muted-foreground">
              This record has already been{" "}
              {props.status === "VERIFIED" ? "approved" : "rejected"}. Its history
              is in the audit trail.
            </p>
          ) : (
            <div className="flex flex-wrap items-center gap-3">
              <Button
                variant="outline"
                disabled={submitting !== null}
                onClick={() => void submit("reject")}
              >
                {submitting === "reject" ? "Rejecting…" : "Reject"}
              </Button>
              <Button
                disabled={submitting !== null}
                onClick={() => void submit("approve")}
              >
                {submitting === "approve" ? "Approving…" : "Approve"}
              </Button>
              <span className="text-xs text-muted-foreground">
                Approving commits the record and issues a ULPIN-style id.
              </span>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
