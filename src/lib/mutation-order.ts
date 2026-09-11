import type { OcrResult } from "@/lib/ocr";
import { extractWith, KHATAUNI_SPEC, type FieldSpec } from "@/lib/extract";
import { parseShare, format } from "@/lib/fraction";
import { analyseChain, type ChainAnalysis, type ChainFinding, type MutationKind, type MutationRow } from "@/lib/chain";
import { LOW_CONFIDENCE_THRESHOLD, type ValidationIssue, type ValidationStatus } from "@/types";

/**
 * Mutation orders — the दाखिल-खारिज document that records one change of
 * ownership.
 *
 * The khatauni says who owns a parcel now. A mutation order is the evidence
 * of how that changed: who transferred what share to whom, when, and on what
 * authority. Reading these off scans is what turns the chain of title from a
 * table somebody typed in into a history reconstructed from the documents.
 *
 * One order per scan. An order joins the parcel's chain only when an officer
 * approves it — until then it is a proposal, and the chain is shown both as it
 * stands and as it would stand if the order were accepted, so a double sale is
 * caught *before* it enters the register rather than after.
 */

export const MUTATION_FIELD_NAMES = [
  "mutationNumber",
  "orderDate",
  "mutationType",
  "fromOwner",
  "toOwner",
  "share",
  "khasraNumber",
  "village",
  "district",
] as const;

export type MutationFieldName = (typeof MUTATION_FIELD_NAMES)[number];
export type MutationFields = Record<MutationFieldName, string | null>;
/** Per-field confidence for an order, 0–1 — keyed by the order's own fields. */
export type MutationConfidence = Partial<Record<MutationFieldName, number>>;

export const MUTATION_FIELD_LABELS: Record<MutationFieldName, string> = {
  mutationNumber: "Mutation number",
  orderDate: "Order date",
  mutationType: "Type of transfer",
  fromOwner: "Transferor",
  toOwner: "Transferee",
  share: "Share transferred",
  khasraNumber: "Khasra number",
  village: "Village",
  district: "District",
};

/**
 * Labels on a UP दाखिल-खारिज order. Chosen so none is the tail of another —
 * the matcher now requires a word boundary at both ends, but a label set
 * that does not lean on that is sturdier on a badly read page.
 */
export const MUTATION_SPEC: Record<MutationFieldName, FieldSpec> = {
  mutationNumber: {
    devanagari: ["दाखिल खारिज संख्या", "नामांतरण संख्या", "नामांतरण क्रमांक"],
    latin: [/mutation\s*(?:no\.?|number)/i],
    shape: /^\d{1,6}\/\d{4}$/,
    singleToken: true,
  },
  orderDate: {
    devanagari: ["आदेश दिनांक", "आदेश की तिथि"],
    latin: [/order\s*date/i],
    shape: /^\d{1,2}[/.-]\d{1,2}[/.-]\d{4}$/,
    singleToken: true,
  },
  mutationType: {
    devanagari: ["अंतरण का प्रकार", "नामांतरण का प्रकार"],
    latin: [/type\s*of\s*transfer/i],
  },
  fromOwner: {
    devanagari: ["हस्तांतरणकर्ता", "पूर्व खातेदार"],
    latin: [/transferor/i],
    shape: /^[ऀ-ॿ\p{L}][ऀ-ॿ\p{L}\s.'-]{2,}$/u,
  },
  toOwner: {
    devanagari: ["प्राप्तकर्ता", "नवीन खातेदार"],
    latin: [/transferee/i],
    shape: /^[ऀ-ॿ\p{L}][ऀ-ॿ\p{L}\s.'-]{2,}$/u,
  },
  share: {
    devanagari: ["अंतरित अंश", "हिस्सा"],
    latin: [/share/i],
    // A fraction, or one word (सम्पूर्ण, however the matras came out).
    // Whether it is a share at all is decided by normaliseShare, on skeleton.
    shape: /^(?:\d+\/\d+|\d+(?:\.\d+)?|[ऀ-ॿ\u200c\u200d]+)$/,
  },
  khasraNumber: KHATAUNI_SPEC.khasraNumber,
  village: KHATAUNI_SPEC.village,
  district: KHATAUNI_SPEC.district,
};

/* ----------------------------------------------------------- classifier */

export type DocumentKind = "KHATAUNI" | "MUTATION_ORDER";

/** Consonant skeleton, for comparing against however OCR spelled a word. */
function skeleton(text: string): string {
  return text.replace(/[ऀ-ःऺ-ॏ॑-ॗॢॣ‌‍\s\-–—:·.|]/g, "");
}

const MUTATION_MARKERS = ["दाखिल खारिज", "नामांतरण", "mutation"].map(skeleton);
const KHATAUNI_MARKERS = ["खतौनी", "अधिकार अभिलेख", "khatauni"].map(skeleton);

/**
 * Which kind of document a page is, from its heading.
 *
 * Rule-based and explained, deliberately — the answer decides which fields
 * are read and which register a record can end up in, so it has to be
 * something a reviewer can check. Only the first few lines are read: a
 * khatauni may mention a mutation in its remarks, but only a mutation order
 * is *headed* as one. Anything unrecognised is treated as a khatauni, the
 * document the system has always read.
 */
export function classifyDocument(ocr: OcrResult): { kind: DocumentKind; reason: string } {
  const lines = (ocr.blocks.length > 0 ? ocr.blocks.map((b) => b.text) : ocr.rawText.split("\n"))
    .slice(0, 4);
  const head = skeleton(lines.join(" ").toLowerCase());

  if (MUTATION_MARKERS.some((m) => head.includes(m))) {
    return { kind: "MUTATION_ORDER", reason: "headed as a दाखिल-खारिज (mutation) order" };
  }
  if (KHATAUNI_MARKERS.some((m) => head.includes(m))) {
    return { kind: "KHATAUNI", reason: "headed as a खतौनी (Record of Rights)" };
  }
  return { kind: "KHATAUNI", reason: "no recognised heading — read as a khatauni" };
}

/* -------------------------------------------------------------- reading */

export function extractMutationOrder(ocr: OcrResult): {
  fields: MutationFields;
  confidence: MutationConfidence;
} {
  return extractWith(ocr, MUTATION_SPEC, MUTATION_FIELD_NAMES);
}

/* -------------------------------------------------------------- parsing */

/** How each kind of transfer is written on an order. Matched on skeleton. */
const TYPE_WORDS: [string, MutationKind][] = [
  ["विक्रय", "SALE"],
  ["बैनामा", "SALE"],
  ["वरासत", "INHERITANCE"],
  ["उत्तराधिकार", "INHERITANCE"],
  ["दान", "GIFT"],
  ["बंटवारा", "PARTITION"],
  ["विभाजन", "PARTITION"],
  ["डिक्री", "DECREE"],
  ["न्यायालय आदेश", "DECREE"],
  ["sale", "SALE"],
  ["inheritance", "INHERITANCE"],
  ["gift", "GIFT"],
  ["partition", "PARTITION"],
  ["decree", "DECREE"],
];

export function parseMutationType(raw: string | null): MutationKind | null {
  if (!raw) return null;
  const s = skeleton(raw.toLowerCase());
  // Longest word first, so न्यायालय आदेश wins over a stray दान inside it.
  const hit = [...TYPE_WORDS]
    .sort((a, b) => skeleton(b[0]).length - skeleton(a[0]).length)
    .find(([word]) => s === skeleton(word.toLowerCase()) || s.startsWith(skeleton(word.toLowerCase())));
  return hit ? hit[1] : null;
}

/** DD/MM/YYYY (or with dots or dashes), as Indian orders are dated. */
export function parseOrderDate(raw: string | null): Date | null {
  if (!raw) return null;
  const m = raw.trim().match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
  if (!m) return null;
  const [day, month, year] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(Date.UTC(year, month - 1, day));
  // Reject 31/02 and friends rather than letting Date roll them over.
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    return null;
  }
  return date;
}

/** Words for "the whole parcel", compared on skeleton — never literally. */
const WHOLE_WORDS = ["सम्पूर्ण", "संपूर्ण", "पूर्ण", "whole", "full"].map((w) => skeleton(w.toLowerCase()));

/**
 * "सम्पूर्ण" (the whole) is written in words; everything else is a fraction.
 *
 * Compared on consonant skeleton, like every other Devanagari word here: on
 * the seeded orders Tesseract read सम्पूर्ण as समपूरण, and a literal match
 * refused it — which left the order unparseable and hid a double sale.
 */
export function normaliseShare(raw: string | null): string | null {
  if (!raw) return null;
  const t = raw.trim();
  if (WHOLE_WORDS.includes(skeleton(t.toLowerCase()))) return "1";
  const f = parseShare(t);
  return f ? format(f) : null;
}

/* ----------------------------------------------------------- validation */

export interface MutationValidation {
  status: ValidationStatus;
  issues: ValidationIssue[];
  /** The register entry this order would become, if it parses. */
  candidate: MutationRow | null;
  /** The chain as it stands today. */
  before: ChainAnalysis;
  /** The chain as it would stand if this order were approved. */
  after: ChainAnalysis | null;
  /** Findings this order would introduce — the reason to reject it, if any. */
  introduced: ChainFinding[];
}

export interface MutationValidationInput {
  fields: MutationFields;
  confidence: MutationConfidence;
  /** The parcel's register as it stands, if its history has been digitised. */
  existing: MutationRow[];
  /** Injected so tests are not time-dependent. */
  now?: Date;
}

const REQUIRED: MutationFieldName[] = [
  "mutationNumber", "orderDate", "mutationType", "toOwner", "share",
  "khasraNumber", "village", "district",
];

export function validateMutationOrder({ fields, confidence, existing, now = new Date() }: MutationValidationInput): MutationValidation {
  const issues: ValidationIssue[] = [];

  for (const f of REQUIRED) {
    if (!fields[f]?.trim()) {
      issues.push({ field: f, kind: "missing", issue: `${MUTATION_FIELD_LABELS[f]} is missing` });
    }
  }

  const type = parseMutationType(fields.mutationType);
  if (fields.mutationType && !type) {
    issues.push({
      field: "mutationType", kind: "range",
      issue: `"${fields.mutationType}" is not a recognised type of transfer — expected sale, inheritance, gift, partition or decree`,
    });
  }
  if (type && type !== "ORIGINAL" && !fields.fromOwner?.trim()) {
    issues.push({ field: "fromOwner", kind: "missing", issue: "A transfer must name who it is from" });
  }

  const date = parseOrderDate(fields.orderDate);
  if (fields.orderDate && !date) {
    issues.push({ field: "orderDate", kind: "range", issue: `"${fields.orderDate}" is not a valid date` });
  }

  const share = normaliseShare(fields.share);
  if (fields.share && !share) {
    issues.push({ field: "share", kind: "range", issue: `"${fields.share}" is not a share of the parcel` });
  }

  for (const [f, score] of Object.entries(confidence)) {
    if (typeof score === "number" && score < LOW_CONFIDENCE_THRESHOLD) {
      const label = MUTATION_FIELD_LABELS[f as MutationFieldName] ?? f;
      issues.push({ field: f, kind: "confidence", issue: `${label} read with low confidence — ${Math.round(score * 100)}%` });
    }
  }

  const before = analyseChain({ mutations: existing, now });

  // Preview the register with this order added. It takes the next place in
  // the register and is recorded now — which is exactly what approving it
  // would do, so what the reviewer sees is what they would be signing.
  const candidate: MutationRow | null =
    type && date && share && fields.toOwner?.trim()
      ? {
          id: "proposed",
          seq: existing.reduce((max, m) => Math.max(max, m.seq), 0) + 1,
          mutationNumber: fields.mutationNumber?.trim() || null,
          type,
          fromOwner: fields.fromOwner?.trim() || null,
          toOwner: fields.toOwner.trim(),
          share,
          effectiveDate: date,
          recordedAt: now,
          supersedesId: null,
        }
      : null;

  let after: ChainAnalysis | null = null;
  let introduced: ChainFinding[] = [];
  if (candidate) {
    after = analyseChain({ mutations: [...existing, candidate], now });
    // Only what this order adds — a defect already in the register is the
    // parcel's problem, not a reason to reject this document.
    const known = new Set(before.findings.map((f) => `${f.kind}|${f.seq ?? ""}|${f.message}`));
    introduced = after.findings.filter((f) => !known.has(`${f.kind}|${f.seq ?? ""}|${f.message}`));
    for (const f of introduced) {
      issues.push({
        field: "fromOwner",
        kind: f.severity === "critical" ? "chainDefect" : "chainWarning",
        issue: f.message,
      });
    }
  }

  // Worst first: a defect in the chain of title is the reason to stop; a
  // low-confidence character is a reason to look closer.
  const RANK: Record<string, number> = { chainDefect: 0, chainWarning: 1, missing: 2, range: 3, confidence: 4 };
  issues.sort((a, b) => (RANK[a.kind ?? ""] ?? 5) - (RANK[b.kind ?? ""] ?? 5));

  return {
    status: issues.length > 0 ? "FLAGGED" : "PASS",
    issues,
    candidate,
    before,
    after,
    introduced,
  };
}
