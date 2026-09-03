/**
 * Unit tests for the extraction pipeline — ticket T4's definition of done:
 * given a sample input, the pipeline returns structured fields, a confidence
 * map, a validation result and a ULPIN, testable in isolation.
 *
 * Runs on Node's built-in test runner: `npm test`. No test framework needed.
 */
import test from "node:test";
import assert from "node:assert/strict";

import { runOcr, isMockOcr, type OcrResult } from "@/lib/ocr";
import { extractFields, meanConfidence } from "@/lib/extract";
import { validateRecord, lowConfidenceFields, type ExistingRecord } from "@/lib/validate";
import { generateUlpin, isValidUlpin, ULPIN_LENGTH } from "@/lib/ulpin";
import { LOW_CONFIDENCE_THRESHOLD, type ExtractedFields } from "@/types";

/* ------------------------------------------------------------------ ulpin */

test("ulpin: generated ids have the seeded shape", () => {
  const ulpin = generateUlpin();
  assert.equal(ulpin.length, ULPIN_LENGTH);
  assert.match(ulpin, /^UP[0-9A-F]{12}$/);
  assert.ok(isValidUlpin(ulpin));
});

test("ulpin: matches the format already in the seed data", () => {
  // From prisma/seed-data.ts — generated ids must not orphan these.
  assert.ok(isValidUlpin("UP62B4F19C83A7"));
  assert.ok(isValidUlpin("UP1D77A0C4E9B2"));
});

test("ulpin: rejects malformed ids", () => {
  for (const bad of ["", "UP123", "up62b4f19c83a7", "XX62B4F19C83A7", "UP62B4F19C83A77", null]) {
    assert.equal(isValidUlpin(bad as string), false, `should reject ${bad}`);
  }
});

test("ulpin: 500 ids are all distinct", () => {
  const seen = new Set(Array.from({ length: 500 }, () => generateUlpin()));
  assert.equal(seen.size, 500);
});

/* -------------------------------------------------------------------- ocr */

test("ocr: defaults to the mock engine", () => {
  assert.ok(isMockOcr());
});

test("ocr: mock returns Devanagari text with per-block confidence", async () => {
  const result = await runOcr("uploads/sample-a.jpg");
  assert.equal(result.language, "hi");
  assert.ok(result.rawText.length > 0);
  assert.ok(result.blocks.length > 0);
  assert.match(result.rawText, /[ऀ-ॿ]/, "should contain Devanagari");
  for (const block of result.blocks) {
    assert.ok(block.confidence > 0 && block.confidence <= 1);
  }
});

test("ocr: mock is deterministic — a demo can be rehearsed", async () => {
  const a = await runOcr("uploads/sample-a.jpg");
  const b = await runOcr("uploads/sample-a.jpg");
  assert.deepEqual(a, b);
});

test("ocr: different files yield different pages", async () => {
  const texts = new Set<string>();
  for (const name of ["a.jpg", "b.jpg", "c.jpg", "d.jpg", "e.jpg", "f.jpg"]) {
    texts.add((await runOcr(`uploads/${name}`)).rawText);
  }
  assert.ok(texts.size > 1, "mock should not return one page for everything");
});

/* ---------------------------------------------------------------- extract */

/** Builds an OcrResult by hand so extraction can be tested without the mock. */
function ocrFrom(lines: [string, number][]): OcrResult {
  return {
    rawText: lines.map(([text]) => text).join("\n"),
    language: "hi",
    blocks: lines.map(([text, confidence]) => ({ text, confidence })),
  };
}

const CLEAN_PAGE = ocrFrom([
  ["अधिकार अभिलेख — खतौनी", 0.99],
  ["जिला: वाराणसी", 0.97],
  ["तहसील: पिंडरा", 0.96],
  ["ग्राम: रामपुर खुर्द", 0.95],
  ["खाता संख्या: 87", 0.94],
  ["खसरा संख्या: 142/3", 0.93],
  ["सर्वे संख्या: 96", 0.92],
  ["स्वामी का नाम: राजेश कुमार वर्मा", 0.91],
  ["क्षेत्रफल (हे.): 1.245", 0.9],
  ["भूमि वर्ग: सिंचित", 0.89],
]);

test("extract: pulls all nine fields off a clean page", () => {
  const { fields, confidence } = extractFields(CLEAN_PAGE);
  assert.equal(fields.district, "वाराणसी");
  assert.equal(fields.tehsil, "पिंडरा");
  assert.equal(fields.village, "रामपुर खुर्द");
  assert.equal(fields.khataNumber, "87");
  assert.equal(fields.khasraNumber, "142/3");
  assert.equal(fields.surveyNumber, "96");
  assert.equal(fields.ownerName, "राजेश कुमार वर्मा");
  assert.equal(fields.plotArea, "1.245");
  assert.equal(fields.landClassification, "सिंचित");
  assert.equal(Object.keys(confidence).length, 9);
});

test("extract: strips the unit written after a value", () => {
  const { fields } = extractFields(ocrFrom([["क्षेत्रफल: 1.245 हेक्टेयर", 0.9]]));
  assert.equal(fields.plotArea, "1.245");
});

test("extract: ULPIN is never read off the page — it is minted on approval", () => {
  const { fields } = extractFields(
    ocrFrom([["ULPIN: UP62B4F19C83A7", 0.99], ["जिला: वाराणसी", 0.9]]),
  );
  assert.equal(fields.ulpin, null);
});

test("extract: a missing field is null and carries no confidence entry", () => {
  const { fields, confidence } = extractFields(ocrFrom([["जिला: वाराणसी", 0.97]]));
  assert.equal(fields.khataNumber, null);
  assert.equal(confidence.khataNumber, undefined,
    "absent must not be conflated with zero-confidence");
});

test("extract: confidence follows the OCR block the value came from", () => {
  const { confidence } = extractFields(
    ocrFrom([["जिला: वाराणसी", 0.97], ["स्वामी का नाम: राजेश कुमार वर्मा", 0.62]]),
  );
  assert.equal(confidence.district, 0.97);
  assert.equal(confidence.ownerName, 0.62);
});

test("extract: an implausible value is penalised below the raw OCR score", () => {
  // Engine was confident, but "abc/xyz" is not a khasra number.
  const { fields, confidence } = extractFields(ocrFrom([["खसरा संख्या: abc/xyz", 0.95]]));
  assert.equal(fields.khasraNumber, "abc/xyz", "value is kept, not silently dropped");
  assert.ok(confidence.khasraNumber! < 0.95);
  assert.ok(confidence.khasraNumber! < LOW_CONFIDENCE_THRESHOLD,
    "should fall far enough to reach a human");
});

test("extract: reads romanised labels too", () => {
  const { fields } = extractFields(
    ocrFrom([["District: Varanasi", 0.9], ["Khasra No.: 142/3", 0.9]]),
  );
  assert.equal(fields.district, "Varanasi");
  assert.equal(fields.khasraNumber, "142/3");
});

test("extract: meanConfidence averages the map", () => {
  assert.equal(meanConfidence({ ownerName: 0.9, district: 0.7 }), 0.8);
  assert.equal(meanConfidence({}), 0);
});

/* --------------------------------------------------------------- validate */

const VALID: ExtractedFields = {
  ownerName: "राजेश कुमार वर्मा", surveyNumber: "96", khasraNumber: "142/3",
  khataNumber: "87", plotArea: "1.245", village: "रामपुर खुर्द",
  tehsil: "पिंडरा", district: "वाराणसी", landClassification: "सिंचित", ulpin: null,
};
const GOOD_CONF = {
  ownerName: 0.96, surveyNumber: 0.94, khasraNumber: 0.95, khataNumber: 0.93,
  plotArea: 0.91, village: 0.97, tehsil: 0.96, district: 0.98, landClassification: 0.92,
};
const EXISTING: ExistingRecord = {
  documentId: "doc-original", ulpin: "UP62B4F19C83A7",
  ownerName: "राजेश कुमार वर्मा", khasraNumber: "142/3", khataNumber: "87",
  village: "रामपुर खुर्द", district: "वाराणसी",
};

test("validate: a clean record passes", () => {
  const result = validateRecord({ fields: VALID, confidence: GOOD_CONF, existing: [] });
  assert.equal(result.status, "PASS");
  assert.deepEqual(result.issues, []);
  assert.equal(result.duplicateOf, null);
});

test("validate: PLANTED #1 — duplicate parcel is caught and linked", () => {
  const result = validateRecord({
    fields: VALID, confidence: GOOD_CONF, existing: [EXISTING],
  });
  assert.equal(result.status, "DUPLICATE");
  assert.equal(result.duplicateOf, "doc-original");
  assert.match(result.issues[0].issue, /Duplicate parcel/);
  assert.match(result.issues[0].issue, /UP62B4F19C83A7/, "should name the existing ULPIN");
});

test("validate: PLANTED #2 — same khata, different owner is flagged", () => {
  const result = validateRecord({
    fields: { ...VALID, khasraNumber: "999", ownerName: "सुनीता देवी" },
    confidence: GOOD_CONF,
    existing: [{ ...EXISTING, ownerName: "सुनीता देवी मिश्रा" }],
  });
  assert.equal(result.status, "FLAGGED");
  assert.ok(result.issues.some((i) => /conflicts with the existing record/.test(i.issue)));
});

test("validate: PLANTED #3 — a missing required field is flagged", () => {
  const result = validateRecord({
    fields: { ...VALID, khataNumber: null }, confidence: GOOD_CONF, existing: [],
  });
  assert.equal(result.status, "FLAGGED");
  assert.ok(result.issues.some((i) => i.field === "khataNumber" && /missing/i.test(i.issue)));
});

test("validate: PLANTED #4 — low-confidence fields are flagged", () => {
  const confidence = { ...GOOD_CONF, ownerName: 0.58, khasraNumber: 0.61 };
  const result = validateRecord({ fields: VALID, confidence, existing: [] });
  assert.equal(result.status, "FLAGGED");
  assert.ok(result.issues.some((i) => /58%/.test(i.issue)));
  assert.deepEqual(lowConfidenceFields(confidence).sort(), ["khasraNumber", "ownerName"]);
});

test("validate: plot area range checks", () => {
  const run = (plotArea: string) =>
    validateRecord({ fields: { ...VALID, plotArea }, confidence: GOOD_CONF, existing: [] });

  assert.equal(run("1.245").status, "PASS");
  assert.ok(run("0").issues.some((i) => /greater than zero/.test(i.issue)));
  assert.ok(run("-5").issues.some((i) => i.field === "plotArea"));
  assert.ok(run("99999").issues.some((i) => /exceeds the plausible maximum/.test(i.issue)));
  assert.ok(run("abc").issues.some((i) => /not a number/.test(i.issue)));
});

test("validate: an owner name containing digits is flagged as column bleed", () => {
  const result = validateRecord({
    fields: { ...VALID, ownerName: "राजेश कुमार 142" }, confidence: GOOD_CONF, existing: [],
  });
  assert.ok(result.issues.some((i) => /neighbouring column/.test(i.issue)));
});

test("validate: a record is never flagged as a duplicate of itself", () => {
  const result = validateRecord({
    fields: VALID, confidence: GOOD_CONF,
    existing: [{ ...EXISTING, documentId: "doc-self" }],
    selfDocumentId: "doc-self",
  });
  assert.equal(result.status, "PASS");
});

test("validate: DUPLICATE outranks FLAGGED", () => {
  const result = validateRecord({
    fields: { ...VALID, khataNumber: null },
    confidence: { ...GOOD_CONF, ownerName: 0.4 },
    existing: [EXISTING],
  });
  assert.equal(result.status, "DUPLICATE", "the duplicate is the finding to act on first");
  assert.ok(result.issues.length > 1, "other issues are still reported");
});

test("validate: a blank parcel key does not match another blank one", () => {
  const result = validateRecord({
    fields: { ...VALID, khasraNumber: null },
    confidence: GOOD_CONF,
    existing: [{ ...EXISTING, khasraNumber: null }],
  });
  assert.notEqual(result.status, "DUPLICATE");
});

/* ----------------------------------------------------- end-to-end (T4 DoD) */

test("pipeline: scan → fields → confidence → validation → ULPIN", async () => {
  const ocr = await runOcr("uploads/seed/demo-page.jpg");
  const { fields, confidence } = extractFields(ocr);
  const validation = validateRecord({ fields, confidence, existing: [] });

  assert.ok(ocr.rawText.length > 0, "OCR produced text");
  assert.ok(fields.ownerName, "owner name extracted");
  assert.ok(fields.district, "district extracted");
  assert.ok(Object.keys(confidence).length >= 8, "confidence map populated");
  assert.ok(["PASS", "FLAGGED", "DUPLICATE"].includes(validation.status));

  // A ULPIN is minted only once a human approves.
  assert.equal(fields.ulpin, null);
  const ulpin = generateUlpin();
  assert.ok(isValidUlpin(ulpin));
});
