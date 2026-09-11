import { strict as assert } from "node:assert";
import { test } from "node:test";
import { scoreRecord } from "@/lib/quality";
import type { ConfidenceMap, ExtractedFields, ValidationIssue } from "@/types";

const FULL: ExtractedFields = {
  ownerName: "राजेश कुमार वर्मा", surveyNumber: "96", khasraNumber: "142/3",
  khataNumber: "87", plotArea: "1.245", village: "रामपुर खुर्द",
  tehsil: "पिंडरा", district: "वाराणसी", landClassification: "सिंचित",
  ulpin: null,
};
const CONFIDENT: ConfidenceMap = {
  ownerName: 0.96, surveyNumber: 0.94, khasraNumber: 0.89, khataNumber: 0.93,
  plotArea: 0.91, village: 0.97, tehsil: 0.96, district: 0.98,
  landClassification: 0.92,
};
const none: ValidationIssue[] = [];

test("a complete, confident, uncontradicted record scores HIGH", () => {
  const q = scoreRecord({ fields: FULL, confidence: CONFIDENT, issues: none });
  assert.equal(q.band, "HIGH");
  assert.ok(q.score >= 85, `expected >= 85, got ${q.score}`);
  assert.equal(q.deductions.length, 0);
});

test("the score is a whole number — it is rendered as a percentage", () => {
  const q = scoreRecord({ fields: FULL, confidence: CONFIDENT, issues: none });
  assert.equal(q.score, Math.round(q.score));
  for (const c of Object.values(q.components)) {
    assert.equal(c.score, Math.round(c.score));
  }
});

test("a duplicate parcel is the heaviest single finding", () => {
  const dup = scoreRecord({
    fields: FULL, confidence: CONFIDENT,
    issues: [{ field: "khasraNumber", kind: "duplicate", issue: "Duplicate parcel" }],
  });
  const variant = scoreRecord({
    fields: FULL, confidence: CONFIDENT,
    issues: [{ field: "ownerName", kind: "ownerVariant", issue: "Name variant" }],
  });
  assert.ok(dup.score < variant.score, "a duplicate must cost more than a name variant");
  assert.equal(dup.components.consistency.score, 20);
});

test("missing fields cost completeness, and are named", () => {
  const partial = { ...FULL, khataNumber: null, tehsil: null };
  const q = scoreRecord({ fields: partial, confidence: CONFIDENT, issues: none });
  assert.equal(q.components.completeness.score, 78); // 7 of 9
  assert.ok(q.deductions.some((d) => d.includes("Khata number")));
  assert.ok(q.deductions.some((d) => d.includes("Tehsil")));
});

test("many uncertain fields pull the record out of the HIGH band", () => {
  // A plain mean would leave this looking healthy. Four uncertain fields in
  // nine means a reviewer has real work to do, and the band must say so.
  const faded: ConfidenceMap = {
    ...CONFIDENT, ownerName: 0.58, khasraNumber: 0.61, plotArea: 0.66,
    landClassification: 0.71,
  };
  const q = scoreRecord({
    fields: FULL, confidence: faded,
    issues: (["ownerName", "khasraNumber", "plotArea", "landClassification"] as const)
      .map((field) => ({ field, kind: "confidence" as const, issue: "Low confidence" })),
  });
  assert.notEqual(q.band, "HIGH", `expected not HIGH, got ${q.band} at ${q.score}`);
  assert.equal(q.components.consistency.score, 100, "confidence must not also cost consistency");
});

test("low confidence is not counted twice", () => {
  // A confidence issue must move the confidence component only. Counting it
  // in consistency as well would punish a faded scan twice for being faded.
  const faded: ConfidenceMap = { ...CONFIDENT, ownerName: 0.31 };
  const q = scoreRecord({
    fields: FULL, confidence: faded,
    issues: [{ field: "ownerName", kind: "confidence", issue: "Low confidence — 31%" }],
  });
  assert.equal(q.components.consistency.score, 100);
  assert.ok(q.components.confidence.score < 95);
});

test("an applied correction never costs the record points", () => {
  const q = scoreRecord({
    fields: FULL, confidence: CONFIDENT,
    issues: [{ field: "tehsil", kind: "learned", issue: "Corrected automatically" }],
  });
  assert.equal(q.components.consistency.score, 100);
  assert.equal(q.deductions.length, 0);
});

test("an empty record scores zero rather than throwing", () => {
  const empty: ExtractedFields = {
    ownerName: null, surveyNumber: null, khasraNumber: null, khataNumber: null,
    plotArea: null, village: null, tehsil: null, district: null,
    landClassification: null, ulpin: null,
  };
  const q = scoreRecord({ fields: empty, confidence: {}, issues: none });
  assert.equal(q.components.completeness.score, 0);
  assert.equal(q.components.confidence.score, 0);
  assert.equal(q.band, "LOW");
});

test("findings are reported worst first", () => {
  const q = scoreRecord({
    fields: FULL, confidence: CONFIDENT,
    issues: [
      { field: "plotArea", kind: "range", issue: "Plot area implausible" },
      { field: "khasraNumber", kind: "duplicate", issue: "Duplicate parcel" },
    ],
  });
  assert.ok(q.deductions[0].includes("Duplicate"), "duplicate should lead");
});

test("issues with no kind are ignored rather than crashing", () => {
  // Validation results stored before kinds existed still parse.
  const q = scoreRecord({
    fields: FULL, confidence: CONFIDENT,
    issues: [{ field: "ownerName", issue: "legacy issue with no kind" }],
  });
  assert.equal(q.components.consistency.score, 100);
});
