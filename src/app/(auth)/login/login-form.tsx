"use client";

import { useActionState, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useI18n } from "@/i18n/client";
import { login, type LoginState } from "./actions";

function SubmitButton() {
  const { pending } = useFormStatus();
  const { t } = useI18n();
  return (
    <Button type="submit" className="w-full" disabled={pending}>
      {pending ? t("login.submitting") : t("login.submit")}
    </Button>
  );
}

export function LoginForm() {
  const [state, formAction] = useActionState<LoginState, FormData>(login, {
    error: null,
  });
  const { t } = useI18n();
  const [shown, setShown] = useState(false);
  const [capsLock, setCapsLock] = useState(false);
  const readCaps = (event: React.KeyboardEvent<HTMLInputElement>) =>
    setCapsLock(event.getModifierState("CapsLock"));

  return (
    <form action={formAction} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="email">{t("login.email")}</Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          placeholder="you@revenue.gov.in"
          aria-invalid={state.error ? true : undefined}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="password">{t("login.password")}</Label>
        <div className="relative">
          <Input
            id="password"
            name="password"
            type={shown ? "text" : "password"}
            autoComplete="current-password"
            required
            onKeyDown={readCaps}
            onKeyUp={readCaps}
            aria-invalid={state.error ? true : undefined}
            className="pr-10"
          />
          <button
            type="button"
            onClick={() => setShown((v) => !v)}
            aria-label={shown ? t("login.hidePassword") : t("login.showPassword")}
            aria-pressed={shown}
            className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-muted-foreground transition-colors hover:text-navy"
          >
            {shown ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
          </button>
        </div>
        {capsLock ? (
          <p className="text-[12px] text-low-confidence">{t("login.capsLock")}</p>
        ) : null}
      </div>

      {state.error ? (
        <p role="alert" className="text-sm text-status-flagged">
          {state.error === "missing" ? t("login.errorMissing") : t("login.errorInvalid")}
        </p>
      ) : null}

      <SubmitButton />
    </form>
  );
}
