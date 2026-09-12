"use client";

import { useRouter } from "next/navigation";
import { LOCALES, LOCALE_COOKIE, LOCALE_NAMES, type Locale } from "@/i18n/config";
import { useI18n } from "@/i18n/client";

/**
 * Interface language, chosen by the reader and remembered in their browser.
 *
 * Each option is written in its own script, so someone who reads only Bengali
 * can find "বাংলা" without first reading the English around it.
 */
export function LanguageSwitcher({ tone = "rail" }: { tone?: "rail" | "paper" }) {
  const router = useRouter();
  const { locale, t } = useI18n();

  function choose(next: Locale) {
    // A year, lax: the choice should survive closing the browser, and is only
    // ever read back by this same site.
    document.cookie = `${LOCALE_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`;
    router.refresh();
  }

  const control =
    tone === "rail"
      ? "border-white/15 bg-rail-2 text-white hover:border-white/35"
      : "border-rule bg-panel text-foreground";

  return (
    <label className="flex items-center gap-2">
      <span className={`text-[11px] ${tone === "rail" ? "text-rail-muted" : "text-muted-foreground"}`}>
        {t("nav.language")}
      </span>
      <select
        value={locale}
        onChange={(event) => choose(event.target.value as Locale)}
        aria-label={t("nav.language")}
        className={`h-7 min-w-0 flex-1 border px-1.5 text-[12.5px] outline-none focus-visible:border-navy ${control}`}
      >
        {LOCALES.map((code) => (
          <option key={code} value={code} lang={code}>
            {LOCALE_NAMES[code]}
          </option>
        ))}
      </select>
    </label>
  );
}
