import type { Metadata } from "next";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LanguageSwitcher } from "@/components/language-switcher";
import { Logo } from "@/components/logo";
import { DEMO_ACCOUNTS, demoMode } from "@/lib/demo-accounts";
import { getI18n } from "@/i18n/server";
import { LoginForm } from "./login-form";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t("login.metaTitle") };
}

/** Read per request, so turning demo mode off takes effect without a rebuild. */
export const dynamic = "force-dynamic";

/**
 * Screen 1 in docs/04_Frontend_Spec.md.
 *
 * The language switcher is here as well as in the bar: someone who cannot read
 * the English sign-in screen is exactly who needs to change it first. The
 * public record check is linked from here because it is the one thing a
 * visitor without an account can do.
 */
export default async function LoginPage() {
  const { t } = await getI18n();
  const demo = demoMode();

  return (
    <main className="flex min-h-screen items-center justify-center bg-paper p-6">
      <div className="w-full max-w-sm space-y-4">
        <div className="space-y-2">
          <Logo tone="onLight" className="h-11 w-auto" />
          <p className="text-[14.5px] text-muted-foreground">
            {t("app.name")} · {t("app.department")}
          </p>
        </div>

        <Card className="w-full border-hairline bg-field shadow-none">
          <CardHeader>
            <CardTitle className="font-serif text-xl font-medium text-navy">{t("login.title")}</CardTitle>
            <p className="text-sm text-muted-foreground">{t("login.subtitle")}</p>
          </CardHeader>
          <CardContent>
            <LoginForm />
          </CardContent>
        </Card>

        {demo ? (
          <div className="border border-dashed border-rule bg-panel px-4 py-3">
            <p className="label-cap">{t("login.demoTitle")}</p>
            <table className="mt-2 w-full text-[14px]">
              <tbody>
                {DEMO_ACCOUNTS.map((account) => (
                  <tr key={account.email} className="align-baseline">
                    <td className="py-0.5 pr-2 font-medium">{t(`roles.${account.role}`)}</td>
                    <td className="py-0.5 pr-2 text-ink-2">{account.email}</td>
                    <td className="py-0.5 font-mono text-[12.5px] text-ink-2">{account.password}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-2 text-[12.5px] leading-snug text-muted-foreground">{t("login.demoNote")}</p>
          </div>
        ) : null}

        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link href="/check" className="text-[14.5px] text-navy underline underline-offset-2">
            {t("login.checkRecord")}
          </Link>
          <div className="w-52">
            <LanguageSwitcher tone="paper" />
          </div>
        </div>
      </div>
    </main>
  );
}
