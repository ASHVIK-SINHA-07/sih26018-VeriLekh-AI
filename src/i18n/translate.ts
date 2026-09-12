import { en } from "@/i18n/messages/en";
import { hi } from "@/i18n/messages/hi";
import { mr } from "@/i18n/messages/mr";
import { bn } from "@/i18n/messages/bn";
import { pa } from "@/i18n/messages/pa";
import { INTL_TAG, type Locale } from "@/i18n/config";

/**
 * Translation, shared by server and client components.
 *
 * Deliberately small — no library. A catalogue is a nested object; `t`
 * walks a dotted key, picks a plural form by count, and fills `{name}`
 * placeholders. English is the fallback for anything missing, so a gap in a
 * translation shows English rather than a raw key.
 */

type Plural = { readonly one: string; readonly other: string };

/** The shape every translation must match — English's keys, any strings. */
export type Messages = Widen<typeof en>;
type Widen<T> = T extends string ? string : { -readonly [K in keyof T]: Widen<T[K]> };

/** Every valid key, as a dotted path: "dashboard.title", "status.PENDING"… */
export type MessageKey = Paths<typeof en>;
type Paths<T, P extends string = ""> = {
  [K in keyof T & string]: T[K] extends string | Plural ? `${P}${K}` : Paths<T[K], `${P}${K}.`>;
}[keyof T & string];

export type Params = Record<string, string | number>;

export interface Translator {
  (key: MessageKey, params?: Params): string;
  /** Whether a key built at runtime — "findings." + a code — exists. */
  has(key: string): key is MessageKey;
}

const CATALOGUES: Record<Locale, Messages> = { en, hi, mr, bn, pa };

function lookup(root: unknown, key: string): unknown {
  let node: unknown = root;
  for (const part of key.split(".")) {
    if (node === null || typeof node !== "object") return undefined;
    node = (node as Record<string, unknown>)[part];
  }
  return node;
}

function interpolate(template: string, params?: Params): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (whole, name: string) =>
    name in params ? String(params[name]) : whole,
  );
}

export function createT(locale: Locale): Translator {
  const catalogue = CATALOGUES[locale];
  const plural = new Intl.PluralRules(INTL_TAG[locale]);

  const t = ((key: MessageKey, params?: Params) => {
    const node = lookup(catalogue, key) ?? lookup(en, key);
    if (typeof node === "string") return interpolate(node, params);
    if (node && typeof node === "object" && "other" in node) {
      const forms = node as Plural;
      const count = Number(params?.count ?? 0);
      return interpolate(plural.select(count) === "one" ? forms.one : forms.other, params);
    }
    return key;
  }) as Translator;

  t.has = (key: string): key is MessageKey => {
    const node = lookup(en, key);
    return typeof node === "string" || (!!node && typeof node === "object" && "other" in node);
  };

  return t;
}

/* ------------------------------------------------------------- formatting */

export function formatDate(locale: Locale, value: Date | string, style: "short" | "medium" = "medium"): string {
  const date = typeof value === "string" ? new Date(value) : value;
  return new Intl.DateTimeFormat(INTL_TAG[locale], {
    day: "numeric",
    month: "short",
    ...(style === "medium" ? { year: "numeric" } : {}),
    // Register dates are calendar dates; UTC keeps a 1 Jan from becoming 31 Dec.
    timeZone: "UTC",
  }).format(date);
}

export function formatDateTime(locale: Locale, value: Date | string): string {
  const date = typeof value === "string" ? new Date(value) : value;
  return date.toLocaleString(INTL_TAG[locale], { dateStyle: "medium", timeStyle: "short" });
}

export function formatCount(locale: Locale, value: number): string {
  return Math.round(value).toLocaleString(INTL_TAG[locale]);
}

/** "2 hours ago", in the reader's language. */
export function relativeTime(locale: Locale, value: string | Date): string {
  const then = typeof value === "string" ? new Date(value) : value;
  const seconds = Math.round((Date.now() - then.getTime()) / 1000);
  const rtf = new Intl.RelativeTimeFormat(INTL_TAG[locale], { numeric: "auto" });
  if (seconds < 60) return rtf.format(0, "second");

  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ["minute", 60], ["hour", 3600], ["day", 86400],
    ["week", 604800], ["month", 2592000], ["year", 31536000],
  ];
  let chosen: Intl.RelativeTimeFormatUnit = "minute";
  let divisor = 60;
  for (const [unit, size] of units) {
    if (seconds >= size) { chosen = unit; divisor = size; }
  }
  return rtf.format(-Math.round(seconds / divisor), chosen);
}

/* --------------------------------------------------------------- findings */

/**
 * A finding as the engines produce it: English text, plus — where the engine
 * provides them — a message code and the values that fill it.
 */
export interface Localisable {
  code?: string;
  params?: Params;
  issue?: string;
  message?: string;
}

const DATE_PARAMS = new Set(["date", "prevDate", "diedDate", "earlierDate"]);

/**
 * Turn a finding's raw values into the reader's language: a field key into
 * its label, a source into its name, a transfer type into its word, an ISO
 * date into a local date. Names and places are record data and pass through
 * untouched.
 */
function localiseParams(t: Translator, locale: Locale, code: string, params: Params): Params {
  const out: Params = { ...params };
  const fieldNamespace = code.startsWith("order") ? "orderFields" : "fields";
  if (typeof out.field === "string") {
    const key = `${fieldNamespace}.${out.field}`;
    if (t.has(key)) out.field = t(key);
  }
  if (typeof out.source === "string") {
    const key = `sources.${out.source}`;
    if (t.has(key)) out.source = t(key);
  }
  if (typeof out.type === "string") {
    const key = `mutationTypes.${out.type}`;
    if (t.has(key)) out.type = t(key);
  }
  // A share of "1" is the whole parcel; "transfers 1 to…" reads as a number.
  if (out.share === "1") out.share = t("chain.theWholeParcel");
  for (const name of DATE_PARAMS) {
    if (typeof out[name] === "string") out[name] = formatDate(locale, out[name] as string);
  }
  return out;
}

/** A finding in the reader's language; its English text when it has no code. */
export function renderFinding(t: Translator, locale: Locale, finding: Localisable): string {
  const fallback = finding.issue ?? finding.message ?? "";
  if (!finding.code) return fallback;
  const key = `findings.${finding.code}`;
  if (!t.has(key)) return fallback;
  return t(key, localiseParams(t, locale, finding.code, finding.params ?? {}));
}
