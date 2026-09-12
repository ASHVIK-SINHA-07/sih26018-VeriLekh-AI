import { EmptyState } from "@/components/empty-state";
import type { AuditLogEntry } from "@/types";
import { en } from "@/i18n/messages/en";
import { getI18n } from "@/i18n/server";
import { formatDateTime, type MessageKey, type Translator } from "@/i18n/translate";

/**
 * Read-only audit history for one record — docs/05_Feature_Tickets.md T10 and
 * the hard requirement in docs/03_Security_Access.md.
 *
 * Display only: there is deliberately no edit or delete path anywhere in this
 * application for an audit row. Every entry below was written by the action it
 * describes; nothing here is generated for display.
 */

/**
 * An EDIT_FIELD entry stores the field's English label, as written at the
 * time — the entry is hashed, so it is never rewritten. To show it in the
 * reader's language, map the English label back to its key.
 */
const LABEL_KEY = new Map<string, MessageKey>([
  ...Object.entries(en.orderFields).map(([k, v]) => [v, `orderFields.${k}`] as [string, MessageKey]),
  ...Object.entries(en.fields).map(([k, v]) => [v, `fields.${k}`] as [string, MessageKey]),
]);

const AUDIT_ACTIONS = new Set(["UPLOAD", "EDIT_FIELD", "APPROVE", "REJECT"]);

const ACTION_COLOURS: Record<string, string> = {
  UPLOAD: "text-status-uploaded",
  EDIT_FIELD: "text-terracotta",
  APPROVE: "text-status-verified",
  REJECT: "text-status-flagged",
};

function describe(t: Translator, entry: AuditLogEntry): string | null {
  const before = entry.before as
    | { field?: string; value?: string | null; status?: string }
    | null;
  const after = entry.after as
    | {
        field?: string; value?: string | null; status?: string; ulpin?: string; fieldsCorrected?: number;
        enteredInRegister?: { entry?: number };
      }
    | null;

  if (entry.action === "EDIT_FIELD" && after?.field) {
    const from = before?.value?.trim() ? before.value : t("common.blank");
    const to = after.value?.trim() ? after.value : t("common.blank");
    const key = LABEL_KEY.get(after.field);
    return `${key ? t(key) : after.field}: ${from} → ${to}`;
  }

  if (entry.action === "APPROVE") {
    const parts: string[] = [];
    if (after?.ulpin) parts.push(t("audit.ulpinIssued", { ulpin: after.ulpin }));
    if (after?.enteredInRegister?.entry !== undefined) {
      parts.push(t("audit.enteredInRegister", { entry: after.enteredInRegister.entry }));
    }
    if (after?.fieldsCorrected) {
      parts.push(t("audit.correctedFirst", { count: after.fieldsCorrected }));
    }
    return parts.length > 0 ? parts.join(" · ") : null;
  }

  if (entry.action === "REJECT" && before?.status) {
    const key = `status.${before.status}`;
    return t("audit.was", { status: t.has(key) ? t(key).toLowerCase() : before.status.toLowerCase() });
  }

  return null;
}

export async function AuditTrail({ entries }: { entries: AuditLogEntry[] }) {
  const { t, locale } = await getI18n();
  return (
    <section className="border border-hairline bg-panel">
      <div className="border-b border-hairline bg-panel-alt px-4 py-2.5">
        <h2>{t("audit.title")}</h2>
        <p className="text-[13px] text-muted-foreground">{t("audit.subtitle")}</p>
      </div>

      {entries.length === 0 ? (
        <div className="p-4"><EmptyState title={t("audit.emptyTitle")} hint={t("audit.emptyHint")} /></div>
      ) : (
        <ol className="divide-y divide-hairline">
          {entries.map((entry) => {
            const detail = describe(t, entry);
            return (
              <li key={entry.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-4 py-2.5">
                <span
                  className={`text-sm font-medium ${ACTION_COLOURS[entry.action] ?? "text-foreground"}`}
                >
                  {AUDIT_ACTIONS.has(entry.action) ? t(`audit.${entry.action as "UPLOAD"}`) : entry.action}
                </span>
                <span className="text-[14px] text-muted-foreground">
                  {entry.actorName} · {t(`roles.${entry.actorRole}`)}
                </span>
                <span className="ml-auto text-xs text-muted-foreground tabular-nums">
                  {formatDateTime(locale, entry.timestamp)}
                </span>
                {detail ? (
                  <p className="w-full text-[14px] text-ink-2">{detail}</p>
                ) : null}
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
