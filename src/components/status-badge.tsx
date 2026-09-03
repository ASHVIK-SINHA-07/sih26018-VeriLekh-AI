import { STATUS_LABELS, type DocumentStatus } from "@/types";

/**
 * StatusBadge — docs/04_Frontend_Spec.md shared components.
 * A pill in the status colour. Labels are sentence case.
 */

const STYLES: Record<DocumentStatus, string> = {
  UPLOADED: "bg-status-uploaded/10 text-status-uploaded border-status-uploaded/25",
  PROCESSING: "bg-status-processing/10 text-status-processing border-status-processing/30",
  PENDING: "bg-status-pending/10 text-status-pending border-status-pending/25",
  VERIFIED: "bg-status-verified/10 text-status-verified border-status-verified/30",
  FLAGGED: "bg-status-flagged/10 text-status-flagged border-status-flagged/30",
  REJECTED: "bg-status-rejected/10 text-status-rejected border-status-rejected/25",
};

export function StatusBadge({ status }: { status: DocumentStatus }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium whitespace-nowrap ${STYLES[status]}`}
    >
      {STATUS_LABELS[status]}
    </span>
  );
}
