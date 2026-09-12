import Link from "next/link";
import { getI18n } from "@/i18n/server";

export default async function NotFound() {
  const { t } = await getI18n();
  return (
    <section className="space-y-3">
      <h1 className="text-xl font-medium text-navy">{t("verify.notFoundTitle")}</h1>
      <p className="text-sm text-muted-foreground">{t("verify.notFoundHint")}</p>
      <Link href="/verify" className="text-sm text-navy underline underline-offset-2">
        {t("verify.notFoundBack")}
      </Link>
    </section>
  );
}
