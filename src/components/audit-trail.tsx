import { EmptyState } from "@/components/empty-state";
import type { AuditLogEntry, Role } from "@/types";

/**
 * Read-only audit history for one record — docs/05_Feature_Tickets.md T10 and
 * the hard requirement in docs/03_Security_Access.md.
 *
 * Display only: there is deliberately no edit or delete path anywhere in this
 * application for an audit row. Every entry below was written by the action it
 * describes; nothing here is generated for display.
 */

const ACTION_LABELS: Record<string, string> = {
  UPLOAD: "Uploaded",
  EDIT_FIELD: "Corrected a field",
  APPROVE: "Approved",
  REJECT: "Rejected",
};

const ROLE_LABELS: Record<Role, string> = {
  ADMIN: "Admin",
  VERIFIER: "Verifier",
  VIEWER: "Viewer",
};

const ACTION_COLOURS: Record<string, string> = {
  UPLOAD: "text-status-uploaded",
  EDIT_FIELD: "text-terracotta",
  APPROVE: "text-status-verified",
  REJECT: "text-status-flagged",
};

function describe(entry: AuditLogEntry): string | null {
  const before = entry.before as
    | { field?: string; value?: string | null; status?: string }
    | null;
  const after = entry.after as
    | { field?: string; value?: string | null; status?: string; ulpin?: string; fieldsCorrected?: number }
    | null;

  if (entry.action === "EDIT_FIELD" && after?.field) {
    const from = before?.value?.trim() ? before.value : "(blank)";
    const to = after.value?.trim() ? after.value : "(blank)";
    return `${after.field}: ${from} → ${to}`;
  }

  if (entry.action === "APPROVE") {
    const parts: string[] = [];
    if (after?.ulpin) parts.push(`ULPIN ${after.ulpin} issued`);
    if (after?.fieldsCorrected) {
      parts.push(
        `${after.fieldsCorrected} field${after.fieldsCorrected === 1 ? "" : "s"} corrected first`,
      );
    }
    return parts.length > 0 ? parts.join(" · ") : null;
  }

  if (entry.action === "REJECT" && before?.status) {
    return `Was ${before.status.toLowerCase()}`;
  }

  return null;
}

export function AuditTrail({ entries }: { entries: AuditLogEntry[] }) {
  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-sm font-medium text-navy">Audit trail</h2>
        <p className="text-xs text-muted-foreground">
          Every change to this record, in order. Append-only — entries cannot be
          edited or removed.
        </p>
      </div>

      {entries.length === 0 ? (
        <EmptyState title="No history yet" hint="Actions on this record will appear here." />
      ) : (
        <ol className="divide-y divide-border rounded-lg border border-border bg-white">
          {entries.map((entry) => {
            const detail = describe(entry);
            return (
              <li key={entry.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-4 py-3">
                <span
                  className={`text-sm font-medium ${ACTION_COLOURS[entry.action] ?? "text-foreground"}`}
                >
                  {ACTION_LABELS[entry.action] ?? entry.action}
                </span>
                <span className="text-sm text-muted-foreground">
                  {entry.actorName} · {ROLE_LABELS[entry.actorRole] ?? entry.actorRole}
                </span>
                <span className="ml-auto text-xs text-muted-foreground">
                  {new Date(entry.timestamp).toLocaleString("en-IN", {
                    dateStyle: "medium",
                    timeStyle: "short",
                  })}
                </span>
                {detail ? (
                  <p className="w-full text-sm text-muted-foreground">{detail}</p>
                ) : null}
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
