"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/status-badge";
import { FieldEditor } from "@/components/field-editor";
import { NgdrsPanel } from "@/components/ngdrs-panel";
import { ScanViewer } from "@/components/scan-viewer";
import { Panel } from "@/components/panel";
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
    <section>
      {/* ------------------------------------------------------------ header */}
      <div className="border-b border-hairline bg-panel px-4 py-4 sm:px-7">
        <Link
          href="/verify"
          className="text-[12.5px] text-navy hover:underline"
        >
          ← Back to queue
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="text-[1.375rem]">{props.filename}</h1>
          <StatusBadge status={props.status} />
          {props.fields.ulpin ? (
            <span className="border border-hairline bg-panel-alt px-2 py-1 font-mono text-[11.5px] tracking-tight text-ink-2 tabular-nums">
              {props.fields.ulpin}
            </span>
          ) : null}
        </div>
      </div>

      <div className="space-y-4 px-4 pt-4 sm:px-7 sm:pt-5">
      {/* -------------------------------------------------- validation banner */}
      {props.validation && props.validation.issues.length > 0 ? (
        <div
          className={`border-l-[3px] bg-panel px-4 py-3 ${
            props.validation.status === "DUPLICATE"
              ? "border-l-status-flagged"
              : "border-l-low-confidence"
          } border-y border-r border-y-hairline border-r-hairline`}
        >
          <p className="text-[13.5px] font-semibold text-foreground">
            {props.validation.status === "DUPLICATE"
              ? "This looks like a parcel that is already recorded"
              : `${props.validation.issues.length} thing${props.validation.issues.length === 1 ? "" : "s"} to check before approving`}
          </p>
          <ul className="mt-2 space-y-1">
            {props.validation.issues.map((issue, index) => (
              <li key={`${issue.field}-${index}`} className="text-[12.5px] text-ink-2">
                · {issue.issue}
              </li>
            ))}
          </ul>
          {props.duplicateOf ? (
            <p className="mt-2 text-[12.5px]">
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
      </div>

      {/* ------------------------------------------------------ two columns */}
      <div className="grid gap-5 p-4 pt-4 sm:p-7 sm:pt-4 xl:grid-cols-2">
        {/* left: the scan */}
        <Panel title="Scanned record" meta="Scroll or click to zoom · drag to move">
          <div>
            <ScanViewer src={scanUrl} filename={props.filename} isPdf={isPdf} />
          </div>
          <p className="border-t border-hairline px-4 py-2 text-[12px] text-muted-foreground">
            Faded areas on the scan are where the reader was least certain.
          </p>
        </Panel>

        {/* right: the fields */}
        <div className="space-y-4">
          <Panel
            title="Extracted fields"
            meta={
              edited.size > 0 ? (
                <span className="text-status-verified">
                  {edited.size} field{edited.size === 1 ? "" : "s"} corrected
                </span>
              ) : (
                "Low-confidence fields are marked"
              )
            }
            bodyClassName="grid gap-4 p-4 sm:grid-cols-2"
          >
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
          </Panel>

          {error ? (
            <p role="alert" className="border border-status-flagged/40 bg-status-flagged/[0.05] px-3 py-2 text-[13px] text-status-flagged">{error}</p>
          ) : null}

          {/* ------------------------------------------------------ actions */}
          {decided ? (
            <p className="border border-hairline bg-panel px-4 py-3 text-[13px] text-muted-foreground">
              This record has already been{" "}
              {props.status === "VERIFIED" ? "approved" : "rejected"}. Its history
              is in the audit trail.
            </p>
          ) : (
            <div className="flex flex-wrap items-center gap-3 border border-hairline bg-panel px-4 py-3">
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
              <span className="text-[12px] text-muted-foreground">
                Approving commits the record and issues a ULPIN-style id.
              </span>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
