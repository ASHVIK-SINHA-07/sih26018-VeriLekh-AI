"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { useI18n } from "@/i18n/client";
import { createApiToken, type CreateTokenState } from "./actions";

function Submit() {
  const { pending } = useFormStatus();
  const { t } = useI18n();
  return (
    <button
      type="submit"
      disabled={pending}
      className="h-9 bg-navy px-4 text-[14px] font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-60"
    >
      {pending ? t("apiAccess.creating") : t("apiAccess.create")}
    </button>
  );
}

/** Name a key, create it, and copy it — it is shown this once only. */
export function CreateTokenForm() {
  const [state, action] = useActionState<CreateTokenState, FormData>(createApiToken, { token: null, error: null });
  const [copiedFor, setCopiedFor] = useState<string | null>(null);
  const { t } = useI18n();

  return (
    <div className="space-y-3">
      <form action={action} className="flex flex-wrap items-end gap-3">
        <label htmlFor="token-name" className="grid min-w-0 flex-1 gap-1.5 text-[14px]">
          <span className="font-medium">{t("apiAccess.name")}</span>
          <input
            id="token-name"
            name="name"
            required
            maxLength={80}
            placeholder={t("apiAccess.namePlaceholder")}
            className="h-9 w-full border border-rule bg-panel px-3 outline-none focus-visible:border-navy"
          />
        </label>
        <Submit />
      </form>

      {state.error === "name" ? (
        <p role="alert" className="text-[13.5px] text-status-flagged">{t("apiAccess.nameRequired")}</p>
      ) : null}

      {state.token ? (
        <div role="status" className="border border-l-[3px] border-hairline border-l-status-verified bg-panel px-4 py-3">
          <p className="text-[14.5px] font-semibold">{t("apiAccess.createdTitle")}</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <code className="border border-hairline bg-panel-alt px-2 py-1 font-mono text-[13px] break-all">{state.token}</code>
            <button
              type="button"
              onClick={() => {
                void navigator.clipboard?.writeText(state.token as string);
                setCopiedFor(state.token);
              }}
              className="border border-rule px-3 py-1 text-[13px] transition-colors hover:border-navy hover:text-navy"
            >
              {copiedFor === state.token ? t("apiAccess.copied") : t("apiAccess.copy")}
            </button>
          </div>
          <p className="mt-2 text-[13px] text-muted-foreground">{t("apiAccess.createdNote")}</p>
        </div>
      ) : null}
    </div>
  );
}
