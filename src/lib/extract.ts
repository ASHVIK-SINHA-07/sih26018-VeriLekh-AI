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

/** Label patterns per field: Devanagari first, romanised as a fallback. */
const FIELD_LABELS: Record<ExtractedFieldName, RegExp[]> = {
  ownerName: [/स्वामी\s*का\s*नाम/, /खातेदार/, /भूमिधर/, /owner(?:'s)?\s*name/i, /owner/i],
  surveyNumber: [/सर्वे\s*(?:संख्या|सं\.?|नं\.?)/, /survey\s*(?:no\.?|number)/i],
  khasraNumber: [/खसरा\s*(?:संख्या|सं\.?|नं\.?)/, /khasra\s*(?:no\.?|number)/i],
  khataNumber: [/खाता\s*(?:संख्या|सं\.?|नं\.?)/, /khata\s*(?:no\.?|number)/i],
  plotArea: [/क्षेत्रफल/, /रकबा/, /(?:plot\s*)?area/i],
  village: [/ग्राम/, /गाँव/, /village/i],
  tehsil: [/तहसील/, /tehsil|tahsil/i],
  district: [/जिला|जनपद/, /district/i],
  landClassification: [/भूमि\s*वर्ग/, /भूमि\s*का\s*प्रकार/, /land\s*class/i],
};

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

/** Confidence multiplier when a value does not match its expected shape. */
const SHAPE_MISMATCH_PENALTY = 0.55;

/** Strips the label, separators and trailing units from a matched line. */
function valueAfterLabel(line: string, label: RegExp): string | null {
  const match = label.exec(line);
  if (!match) return null;

  let value = line.slice(match.index + match[0].length);

  // Drop a parenthetical unit that belongs to the label, e.g. "क्षेत्रफल (हे.)"
  value = value.replace(/^\s*\([^)]*\)/, "");
  // Drop the separator between label and value.
  value = value.replace(/^[\s:：\-–—.]+/, "");
  // Drop a trailing unit written after the value, e.g. "1.245 हेक्टेयर"
  value = value.replace(/\s*(?:हेक्टेयर|हे\.?|एकड़|hectare?s?|ha\.?|acres?)\s*$/i, "");

  value = value.trim();
  return value.length > 0 ? value : null;
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

    for (const label of FIELD_LABELS[field]) {
      const block = blocks.find((candidate) => label.test(candidate.text));
      if (!block) continue;

      const value = valueAfterLabel(block.text, label);
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
