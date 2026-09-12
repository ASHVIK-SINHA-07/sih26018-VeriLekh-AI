import type { Metadata } from "next";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LanguageSwitcher } from "@/components/language-switcher";
import { getI18n } from "@/i18n/server";
import { LoginForm } from "./login-form";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t("login.metaTitle") };
}

/**
 * Screen 1 in docs/04_Frontend_Spec.md.
 *
 * The language switcher is here as well as in the rail: someone who cannot
 * read the English login screen is exactly who needs to change it first.
 */
export default async function LoginPage() {
  const { t } = await getI18n();
  return (
    <main className="flex min-h-screen items-center justify-center bg-paper p-6">
      <div className="w-full max-w-sm space-y-3">
        <Card className="w-full border-hairline bg-field shadow-none">
          <CardHeader>
            <CardTitle className="font-serif text-xl font-medium text-navy">
              {t("app.name")}
            </CardTitle>
            <div className="mt-1 h-[2px] w-10 bg-terracotta" />
            <p className="text-sm text-muted-foreground">{t("login.subtitle")}</p>
          </CardHeader>
          <CardContent>
            <LoginForm />
          </CardContent>
        </Card>
        <LanguageSwitcher tone="paper" />
      </div>
    </main>
  );
}
