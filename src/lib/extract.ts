import type { OcrResult } from "@/lib/ocr";
import {
  EXTRACTED_FIELD_NAMES,
  type ConfidenceMap,
  type ExtractedFieldName,
  type ExtractedFields,
} from "@/types";

/**
 * Raw OCR text → structured fields — docs/01_PRD.md F4 and F5.
 *
 * Land-record labels follow predictable forms, so this is rule-based rather
 * than statistical: each field has a set of label patterns, and the value is
 * whatever follows the label on that line.
 *
 * Confidence (F5) is the OCR engine's own confidence for the line the value
 * came from, reduced when the value does not look like what that field should
 * contain. So a number the engine read clearly but which is not a plausible
 * khasra number scores lower than the raw OCR confidence alone — that is the
 * signal a human reviewer needs.
 */

/**
 * Devanagari label forms, matched on their consonant skeleton (below).
 *
 * OCR engines decompose Devanagari inconsistently — Tesseract reads
 * क्षेत्रफल as कषेत्रफल and जिला as जलि, reordering the matras. Comparing
 * skeletons makes those the same string, so a label is recognised however
 * the engine happened to spell it.
 */
/**
 * Devanagari field labels, Hindi first then Marathi.
 *
 * Both languages share the script, so one recognition pass reads either — but
 * they do not share the vocabulary. A Maharashtra 7/12 extract says जिल्हा
 * where a UP khatauni says जिला, तालुका for तहसील, गाव for ग्राम. Listing the
 * alternates here is all it takes to read both, because matching is on the
 * consonant skeleton (D36) rather than the literal string.
 *
 * Longer labels must come before their own prefixes — `खाते क्रमांक` before
 * `खाता`, `गट क्रमांक` before `गट` — or the shorter one matches first and the
 * value is read from the wrong column.
 */
const DEVANAGARI_LABELS: Record<ExtractedFieldName, string[]> = {
  ownerName: ["स्वामी का नाम", "मालकाचे नाव", "खातेदाराचे नाव", "खातेदार", "भूमिधर"],
  surveyNumber: ["सर्वे संख्या", "सर्व्हे क्रमांक", "सर्वे"],
  khasraNumber: ["खसरा संख्या", "गट क्रमांक", "भूमापन क्रमांक", "खसरा"],
  khataNumber: ["खाता संख्या", "खाते क्रमांक", "खाता"],
  plotArea: ["क्षेत्रफल", "क्षेत्र", "रकबा"],
  village: ["ग्राम", "गाँव", "गाव"],
  tehsil: ["तहसील", "तालुका"],
  district: ["जिला", "जिल्हा", "जनपद"],
  landClassification: ["भूमि वर्ग", "जमीन प्रकार", "भूमि का प्रकार"],
};

/** Romanised fallbacks, for a page or engine that transliterates. */
const LATIN_LABELS: Record<ExtractedFieldName, RegExp[]> = {
  ownerName: [/owner(?:'s)?\s*name/i, /owner/i],
  surveyNumber: [/survey\s*(?:no\.?|number)/i],
  khasraNumber: [/khasra\s*(?:no\.?|number)/i],
  khataNumber: [/khata\s*(?:no\.?|number)/i],
  plotArea: [/(?:plot\s*)?area/i],
  village: [/village/i],
  tehsil: [/tehsil|tahsil/i],
  district: [/district/i],
  landClassification: [/land\s*class(?:ification)?/i],
};

/**
 * Devanagari combining marks: vowel signs, virama, anusvara, candrabindu,
 * visarga. Removing them leaves the consonant skeleton, which survives the
 * reordering OCR introduces.
 */
const COMBINING_MARKS =
  /[\u0900-\u0903\u093A-\u094F\u0951-\u0957\u0962\u0963\u200c\u200d]/;

/**
 * Reduce text to its consonant skeleton, keeping a map back to the original
 * string so a matched label can be sliced off the untouched line.
 */
function skeletonise(value: string): { skeleton: string; index: number[] } {
  const chars: string[] = [];
  const index: number[] = [];
  for (let i = 0; i < value.length; i += 1) {
    const char = value[i];
    // Whitespace and dashes are dropped as well: OCR writes दाखिल-खारिज as
    // "दाखिल-खारिज", "दाखिल -- खारिज" or "दाखिल खारिज", and all three are the
    // same label.
    if (COMBINING_MARKS.test(char) || /[\s\-–—]/.test(char)) continue;
    chars.push(char);
    index.push(i);
  }
  return { skeleton: chars.join(""), index };
}

/**
 * Everything the engine needs to find one field on a page. Khatauni fields
 * and mutation-order fields are both described this way, so one extractor —
 * with its skeleton matching, repeated-label stripping and shape checks —
 * serves every document type instead of two copies drifting apart.
 */
export interface FieldSpec {
  /** Devanagari labels, longest first — matched on consonant skeleton. */
  devanagari: string[];
  /** Romanised fallbacks. */
  latin: RegExp[];
  /** What a plausible value looks like; a mismatch cuts confidence. */
  shape?: RegExp;
  /** Always one token — never a name or a place. */
  singleToken?: boolean;
}

/**
 * What a plausible value looks like. A value failing this is still extracted —
 * suppressing it would hide the problem — but its confidence is cut so the
 * field surfaces for review.
 */
const FIELD_SHAPES: Partial<Record<ExtractedFieldName, RegExp>> = {
  // Devanagari or Latin letters, spaces, dots. No digits in a person's name.
  ownerName: /^[ऀ-ॿ\p{L}][ऀ-ॿ\p{L}\s.'-]{2,}$/u,
  // Numerals, optionally with a sub-division suffix: 142, 142/3, 142/3-A
  surveyNumber: /^\d{1,6}(?:\/\d{1,4})?(?:-[ऀ-ॿA-Za-z0-9]{1,4})?$/,
  khasraNumber: /^\d{1,6}(?:\/\d{1,4})?(?:-[ऀ-ॿA-Za-z0-9]{1,4})?$/,
  khataNumber: /^\d{1,6}(?:\/\d{1,4})?$/,
  plotArea: /^\d{1,5}(?:\.\d{1,4})?$/,
};

/** Fields that are always a single token — never a name or a place. */
const SINGLE_TOKEN_FIELDS = new Set<ExtractedFieldName>([
  "surveyNumber",
  "khasraNumber",
  "khataNumber",
  "plotArea",
]);

/** Confidence multiplier when a value does not match its expected shape. */
const SHAPE_MISMATCH_PENALTY = 0.55;

/**
 * "संख्या" / "सं" / "नं" — the word "number" itself. When two passes read the
 * label differently, one copy of this can survive on the front of the value.
 */
const NUMBER_WORDS = ["संख्या", "संख", "सं", "नं", "no", "number"];

/** Leading separators between a label and its value. */
const LEAD_SEPARATORS = /^[\s:：\-–—._|।/\\]+/;

/**
 * Merging several recognition passes can leave the label written twice
 * ("तहसील तहसील. मलहिबाद"). Strip any repeat sitting at the front of the
 * value before reading it.
 */
function stripRepeatedLabel(rest: string, spec: FieldSpec): string {
  let value = rest;
  for (let round = 0; round < 2; round += 1) {
    value = value.replace(LEAD_SEPARATORS, "");
    const shape = skeletonise(value);
    let stripped = false;

    for (const label of spec.devanagari) {
      const target = skeletonise(label).skeleton;
      if (!target || !shape.skeleton.startsWith(target)) continue;

      let end = shape.index[target.length - 1] + 1;
      while (end < value.length && COMBINING_MARKS.test(value[end])) end += 1;
      if (end < value.length && /\p{L}/u.test(value[end])) continue;

      value = value.slice(end);
      stripped = true;
      break;
    }
    if (!stripped) break;
  }

  // Then any surviving copy of the word "number".
  value = value.replace(LEAD_SEPARATORS, "");
  const lead = skeletonise(value);
  for (const word of NUMBER_WORDS) {
    const target = skeletonise(word).skeleton;
    if (!target || !lead.skeleton.startsWith(target)) continue;
    let end = lead.index[target.length - 1] + 1;
    while (end < value.length && COMBINING_MARKS.test(value[end])) end += 1;
    if (end < value.length && /\p{L}/u.test(value[end])) continue;
    value = value.slice(end);
    break;
  }

  return value;
}

/** Everything after `cut`, cleaned of separators, units and OCR speckle. */
function valueAfter(line: string, cut: number, spec: FieldSpec): string | null {
  let value = stripRepeatedLabel(line.slice(cut), spec);

  // Drop a parenthetical unit that belongs to the label, e.g. "क्षेत्रफल (हे.)"
  value = value.replace(/^\s*\([^)]*\)/, "");
  // Drop the separator between label and value.
  value = value.replace(LEAD_SEPARATORS, "");
  // Drop a trailing unit written after the value, e.g. "1.245 हेक्टेयर"
  value = value.replace(/\s*(?:हेक्टेयर|हे\.?|एकड़|hectare?s?|ha\.?|acres?)\s*$/i, "");

  // Rules, danda and page speckle come through as stray marks on the ends of
  // a value. They are never part of a land record field.
  value = value.replace(/[\s|।_,;:.\-—–*"'`()\[\]]+$/u, "");
  value = value.replace(/^[|।_*"'`]+/u, "");

  value = value.trim();
  if (value.length === 0) return null;

  // Merging recognition passes can leave a number read twice in different
  // ways ("87 8/7", "1.245 24 5"). For a field that is always one token, the
  // first token matching its shape is the reading to trust. Names and place
  // names are excluded — those contain spaces legitimately.
  const shape = spec.singleToken ? spec.shape : undefined;
  if (shape && /\s/.test(value)) {
    const token = value.split(/\s+/).find((part) => shape.test(part));
    if (token) return token;
  }

  return value;
}

/**
 * Find a field's label in a line and return where it ends, or -1.
 * Devanagari is matched on skeleton, Latin on the plain pattern.
 */
function labelEndsAt(line: string, spec: FieldSpec): number {
  const line_ = skeletonise(line);

  for (const label of spec.devanagari) {
    const target = skeletonise(label).skeleton;
    if (!target) continue;

    for (let at = line_.skeleton.indexOf(target); at !== -1; at = line_.skeleton.indexOf(target, at + 1)) {
      // The match must *start* a word. Without this, क्रेता (buyer) matches
      // the tail of हस्तांतरणकर्ता (transferor) and the buyer is read off the
      // seller's line. A mark before the match belongs to the previous letter.
      const start = line_.index[at];
      if (start > 0 && /[\p{L}\p{M}]/u.test(line[start - 1])) continue;

      // Map the end of the skeleton match back into the original string, then
      // step past any matra hanging off that last consonant — the skeleton
      // dropped it, but it is still part of the label, not the value.
      let end = line_.index[at + target.length - 1] + 1;
      while (end < line.length && COMBINING_MARKS.test(line[end])) end += 1;

      // And it must *end* a word. Without this, खाता (khata) matches inside
      // खतौनी (khatauni, the document type in the page header) and the khata
      // number is read off the title.
      if (end < line.length && /\p{L}/u.test(line[end])) continue;

      return end;
    }
  }

  for (const pattern of spec.latin) {
    const match = pattern.exec(line);
    if (match) return match.index + match[0].length;
  }

  return -1;
}

function looksRight(spec: FieldSpec, value: string): boolean {
  return spec.shape ? spec.shape.test(value) : value.length > 0;
}

export interface ExtractionOutput {
  fields: ExtractedFields;
  confidence: ConfidenceMap;
}

/** The khatauni's nine fields, described for the shared engine. */
export const KHATAUNI_SPEC: Record<ExtractedFieldName, FieldSpec> = Object.fromEntries(
  EXTRACTED_FIELD_NAMES.map((field) => [field, {
    devanagari: DEVANAGARI_LABELS[field],
    latin: LATIN_LABELS[field],
    shape: FIELD_SHAPES[field],
    singleToken: SINGLE_TOKEN_FIELDS.has(field),
  }]),
) as Record<ExtractedFieldName, FieldSpec>;

/**
 * Read any set of fields off a page, given a spec for each.
 *
 * Fields not found on the page are left null and carry no confidence entry —
 * an absent field is a validation problem, not a zero-confidence one, and the
 * two must not be conflated.
 */
export function extractWith<F extends string>(
  ocr: OcrResult,
  spec: Record<F, FieldSpec>,
  names: readonly F[],
): { fields: Record<F, string | null>; confidence: Partial<Record<F, number>> } {
  // Prefer per-line blocks (they carry confidence); fall back to rawText.
  const blocks =
    ocr.blocks.length > 0
      ? ocr.blocks
      : ocr.rawText.split("\n").map((text) => ({ text, confidence: 0.5 }));

  const fields = {} as Record<F, string | null>;
  const confidence: Partial<Record<F, number>> = {};

  for (const name of names) {
    fields[name] = null;
    const fieldSpec = spec[name];

    for (const block of blocks) {
      const cut = labelEndsAt(block.text, fieldSpec);
      if (cut === -1) continue;

      const value = valueAfter(block.text, cut, fieldSpec);
      if (!value) continue;

      fields[name] = value;
      const score = looksRight(fieldSpec, value)
        ? block.confidence
        : block.confidence * SHAPE_MISMATCH_PENALTY;
      confidence[name] = Number(Math.min(0.99, Math.max(0, score)).toFixed(2));
      break;
    }
  }

  return { fields, confidence };
}

/** Extracts the khatauni's structured fields from an OCR result. */
export function extractFields(ocr: OcrResult): ExtractionOutput {
  const { fields, confidence } = extractWith(ocr, KHATAUNI_SPEC, EXTRACTED_FIELD_NAMES);
  // ULPIN is minted on approval, never read off the page.
  return { fields: { ...fields, ulpin: null } as ExtractedFields, confidence: confidence as ConfidenceMap };
}

/**
 * Mean of every per-field confidence value, 0–1.
 * Used for the dashboard's extraction-accuracy figure (CLAUDE.md D7).
 */
export function meanConfidence(confidence: ConfidenceMap): number {
  const scores = Object.values(confidence).filter(
    (score): score is number => typeof score === "number",
  );
  if (scores.length === 0) return 0;
  return scores.reduce((sum, score) => sum + score, 0) / scores.length;
}
