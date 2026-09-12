"use client";

import { createContext, useContext, useMemo } from "react";
import type { Locale } from "@/i18n/config";
import { createT, type Translator } from "@/i18n/translate";

/**
 * The interface language for client components. The root layout reads the
 * cookie on the server and passes the locale down, so server and client
 * render the same language on the first paint — no flash of English.
 */
const I18nContext = createContext<{ locale: Locale; t: Translator } | null>(null);

export function I18nProvider({ locale, children }: { locale: Locale; children: React.ReactNode }) {
  const value = useMemo(() => ({ locale, t: createT(locale) }), [locale]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): { locale: Locale; t: Translator } {
  const value = useContext(I18nContext);
  if (!value) throw new Error("useI18n must be used inside I18nProvider");
  return value;
}
