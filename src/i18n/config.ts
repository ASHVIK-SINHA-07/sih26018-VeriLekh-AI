/**
 * Interface languages.
 *
 * The screens can be shown in any of these; the land-record data on them is
 * never translated — a name or a village is shown exactly as the register
 * writes it. Odia is not here yet: every language needs a native reader to
 * check it before a revenue official sees it, and nobody has checked Odia.
 */
export const LOCALES = ["en", "hi", "mr", "bn", "pa"] as const;
export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "en";
export const LOCALE_COOKIE = "lang";

/** Each language named in its own script, so a reader can find their own. */
export const LOCALE_NAMES: Record<Locale, string> = {
  en: "English",
  hi: "हिन्दी",
  mr: "मराठी",
  bn: "বাংলা",
  pa: "ਪੰਜਾਬੀ",
};

/**
 * The tag used for dates, numbers and plural rules. Always Latin digits:
 * khasra, khata and survey numbers are written in Latin digits in the
 * records, and one screen must not mix two numeral systems.
 */
export const INTL_TAG: Record<Locale, string> = {
  en: "en-IN",
  hi: "hi-IN-u-nu-latn",
  mr: "mr-IN-u-nu-latn",
  bn: "bn-IN-u-nu-latn",
  pa: "pa-IN-u-nu-latn",
};

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (LOCALES as readonly string[]).includes(value);
}
