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
const DEVANAGARI_LABELS: Record<ExtractedFieldName, string[]> = {
  ownerName: ["स्वामी का नाम", "खातेदार", "भूमिधर"],
  surveyNumber: ["सर्वे संख्या", "सर्वे"],
  khasraNumber: ["खसरा संख्या", "खसरा"],
  khataNumber: ["खाता संख्या", "खाता"],
  plotArea: ["क्षेत्रफल", "रकबा"],
  village: ["ग्राम", "गाँव"],
  tehsil: ["तहसील"],
  district: ["जिला", "जनपद"],
  landClassification: ["भूमि वर्ग", "भूमि का प्रकार"],
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
    if (COMBINING_MARKS.test(char) || /\s/.test(char)) continue;
    chars.push(char);
    index.push(i);
  }
  return { skeleton: chars.join(""), index };
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
function stripRepeatedLabel(rest: string, field: ExtractedFieldName): string {
  let value = rest;
  for (let round = 0; round < 2; round += 1) {
    value = value.replace(LEAD_SEPARATORS, "");
    const shape = skeletonise(value);
    let stripped = false;

    for (const label of DEVANAGARI_LABELS[field]) {
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
function valueAfter(line: string, cut: number, field: ExtractedFieldName): string | null {
  let value = stripRepeatedLabel(line.slice(cut), field);

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
  const shape = SINGLE_TOKEN_FIELDS.has(field) ? FIELD_SHAPES[field] : undefined;
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
function labelEndsAt(line: string, field: ExtractedFieldName): number {
  const line_ = skeletonise(line);

  for (const label of DEVANAGARI_LABELS[field]) {
    const target = skeletonise(label).skeleton;
    if (!target) continue;
    const at = line_.skeleton.indexOf(target);
    if (at !== -1) {
      // Map the end of the skeleton match back into the original string, then
      // step past any matra hanging off that last consonant — the skeleton
      // dropped it, but it is still part of the label, not the value.
      let end = line_.index[at + target.length - 1] + 1;
      while (end < line.length && COMBINING_MARKS.test(line[end])) end += 1;

      // The skeleton match must end a word. Without this, खाता (khata) matches
      // inside खतौनी (khatauni, the document type in the page header) and the
      // khata number is read off the title.
      if (end < line.length && /\p{L}/u.test(line[end])) continue;

      return end;
    }
  }

  for (const pattern of LATIN_LABELS[field]) {
    const match = pattern.exec(line);
    if (match) return match.index + match[0].length;
  }

  return -1;
}

function looksRight(field: ExtractedFieldName, value: string): boolean {
  const shape = FIELD_SHAPES[field];
  return shape ? shape.test(value) : value.length > 0;
}

export interface ExtractionOutput {
  fields: ExtractedFields;
  confidence: ConfidenceMap;
}

/**
 * Extracts structured fields from an OCR result.
 *
 * Fields not found on the page are left null and carry no confidence entry —
 * an absent field is a validation problem, not a zero-confidence one, and the
 * two must not be conflated.
 */
export function extractFields(ocr: OcrResult): ExtractionOutput {
  // Prefer per-line blocks (they carry confidence); fall back to rawText.
  const blocks =
    ocr.blocks.length > 0
      ? ocr.blocks
      : ocr.rawText.split("\n").map((text) => ({ text, confidence: 0.5 }));

  const fields = {} as ExtractedFields;
  const confidence: ConfidenceMap = {};

  for (const field of EXTRACTED_FIELD_NAMES) {
    fields[field] = null;

    for (const block of blocks) {
      const cut = labelEndsAt(block.text, field);
      if (cut === -1) continue;

      const value = valueAfter(block.text, cut, field);
      if (!value) continue;

      fields[field] = value;
      const score = looksRight(field, value)
        ? block.confidence
        : block.confidence * SHAPE_MISMATCH_PENALTY;
      confidence[field] = Number(Math.min(0.99, Math.max(0, score)).toFixed(2));
      break;
    }
  }

  // ULPIN is minted on approval, never read off the page.
  fields.ulpin = null;

  return { fields, confidence };
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
