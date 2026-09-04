import { STATUS_LABELS, type DocumentStatus } from "@/types";

/**
 * StatusBadge — a stamped mark, not a pill.
 *
 * Square corners and a thin rule in the status colour, the way a clerk's
 * rubber stamp sits on a register page. No fill beyond a faint tint, so a
 * column of these reads as annotation rather than decoration.
 */
const STYLES: Record<DocumentStatus, string> = {
  UPLOADED: "border-status-uploaded/45 text-status-uploaded",
  PROCESSING: "border-status-processing/55 text-status-processing",
  PENDING: "border-status-pending/45 text-status-pending",
  VERIFIED: "border-status-verified/55 text-status-verified",
  FLAGGED: "border-status-flagged/55 text-status-flagged",
  REJECTED: "border-status-rejected/45 text-status-rejected",
};

export function StatusBadge({ status }: { status: DocumentStatus }) {
  return (
    <span
      className={`inline-flex items-center border px-2 py-[3px] text-[11px] font-medium tracking-[0.06em] whitespace-nowrap uppercase ${STYLES[status]}`}
    >
      {STATUS_LABELS[status]}
    </span>
  );
}
