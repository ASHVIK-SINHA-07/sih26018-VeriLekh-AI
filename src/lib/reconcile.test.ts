import { strict as assert } from "node:assert";
import { test } from "node:test";
import { reconcile, type AuthoritativeRow } from "@/lib/reconcile";
import type { ExtractedFields } from "@/types";

/**
 * The failure modes these tests pin come from a government quality evaluation
 * of land records: area-mismatch claims, ownership on the ground differing
 * from the record, and Records of Rights never updated after an inheritance.
 */

const OURS: ExtractedFields = {
  ownerName: "राजेश कुमार वर्मा", surveyNumber: "96", khasraNumber: "142/3",
  khataNumber: "87", plotArea: "1.245", village: "रामपुर खुर्द",
  tehsil: "पिंडरा", district: "वाराणसी", landClassification: "सिंचित",
  ulpin: null,
};

const NOW = new Date("2026-09-11T00:00:00Z");
const RECENT = new Date("2026-06-01T00:00:00Z");

function row(over: Partial<AuthoritativeRow> = {}): AuthoritativeRow {
  return {
    source: "ROR", khasraNumber: "142/3", village: "रामपुर खुर्द", district: "वाराणसी",
    ownerName: "राजेश कुमार वर्मा", khataNumber: "87", plotArea: "1.245",
    landClassification: "सिंचित", asOf: RECENT, ...over,
  };
}

test("a parcel every source agrees on reports AGREES", () => {
  const r = reconcile({ fields: OURS, sources: [row()], now: NOW });
  assert.equal(r.status, "AGREES");
  assert.equal(r.conflicts.length, 0);
  assert.deepEqual(r.matched, ["ROR"]);
});

test("a parcel no source holds reports NOT_FOUND", () => {
  const r = reconcile({ fields: OURS, sources: [row({ khasraNumber: "999/1" })], now: NOW });
  assert.equal(r.status, "NOT_FOUND");
  assert.equal(r.matched.length, 0);
});

test("an area mismatch beyond tolerance is a conflict", () => {
  // The documented defect: the revenue record and the survey disagree on how
  // much land the parcel is.
  const r = reconcile({
    fields: OURS,
    sources: [row({ source: "CADASTRAL", plotArea: "1.180", ownerName: null, khataNumber: null, landClassification: null })],
    now: NOW,
  });
  assert.equal(r.status, "CONFLICTS");
  const area = r.conflicts.find((c) => c.field === "plotArea");
  assert.ok(area, "expected a plot area conflict");
  assert.match(area.message ?? "", /1\.245 ha/);
  assert.match(area.message ?? "", /1\.180 ha/);
});

test("measurement drift within tolerance is not a conflict", () => {
  // Survey and revenue measurement genuinely disagree a little; flagging that
  // would bury the real findings in noise.
  const r = reconcile({
    fields: OURS,
    sources: [row({ source: "CADASTRAL", plotArea: "1.250", ownerName: null, khataNumber: null, landClassification: null })],
    now: NOW,
  });
  assert.equal(r.status, "AGREES");
});

test("a different owner upstream is a conflict, not a misreading", () => {
  const r = reconcile({
    fields: OURS,
    sources: [row({ source: "REGISTRATION", ownerName: "सुनीता देवी मिश्रा" })],
    now: NOW,
  });
  const owner = r.conflicts.find((c) => c.field === "ownerName");
  assert.ok(owner);
  assert.equal(owner.agreement, "differs");
});

test("a transposed matra is the same name, not a disagreement", () => {
  // Devanagari labels and names are matched on their consonant skeleton
  // (CLAUDE.md D36), so the recogniser's commonest error — a reordered matra —
  // resolves as the same person. Reporting it as a conflict would flag almost
  // every parcel and teach reviewers to ignore the panel.
  const r = reconcile({
    fields: { ...OURS, ownerName: "राजेश कुमार वरमा" },
    sources: [row()],
    now: NOW,
  });
  assert.equal(r.status, "AGREES");
});

test("a name differing by a consonant is a variant to confirm", () => {
  // शर्मा against वर्मा: one consonant apart, which is a plausible misread of
  // the scan rather than a different person — so it asks for a check, not a
  // title dispute.
  const r = reconcile({
    fields: { ...OURS, ownerName: "राजेश कुमार शर्मा" },
    sources: [row()],
    now: NOW,
  });
  const owner = r.conflicts.find((c) => c.field === "ownerName");
  assert.ok(owner, "expected an owner finding");
  assert.equal(owner.agreement, "variant");
  assert.match(owner.message ?? "", /misreading/);
});

test("a source that has not been updated in years is flagged", () => {
  // Un-updated mutation: the single most common real defect.
  const r = reconcile({
    fields: OURS,
    sources: [row({ asOf: new Date("2015-04-01T00:00:00Z") })],
    now: NOW,
  });
  assert.equal(r.status, "CONFLICTS");
  assert.equal(r.stale.length, 1);
  assert.ok(r.stale[0].years >= 11);
});

test("a field a source does not carry is absent, not a conflict", () => {
  // A cadastral record has an extent but no owner. Treating that as a
  // disagreement would flag every parcel.
  const r = reconcile({
    fields: OURS,
    sources: [row({ source: "CADASTRAL", ownerName: null, khataNumber: null, landClassification: null })],
    now: NOW,
  });
  assert.equal(r.status, "AGREES");
  assert.ok(r.findings.some((f) => f.field === "ownerName" && f.agreement === "absent"));
});

test("a field missing from our scan but held upstream is a conflict", () => {
  const r = reconcile({
    fields: { ...OURS, khataNumber: null },
    sources: [row()],
    now: NOW,
  });
  const khata = r.conflicts.find((c) => c.field === "khataNumber");
  assert.ok(khata);
  assert.match(khata.message ?? "", /missing from this scan/);
});

test("three sources disagreeing are all reported", () => {
  const r = reconcile({
    fields: OURS,
    sources: [
      row({ source: "ROR" }),
      row({ source: "REGISTRATION", ownerName: "मोहन लाल" }),
      row({ source: "CADASTRAL", plotArea: "1.100", ownerName: null, khataNumber: null, landClassification: null }),
    ],
    now: NOW,
  });
  assert.equal(r.matched.length, 3);
  assert.ok(r.conflicts.some((c) => c.source === "REGISTRATION"));
  assert.ok(r.conflicts.some((c) => c.source === "CADASTRAL"));
});

test("village names are matched leniently, khasra numbers exactly", () => {
  // The village may be misread; the parcel number must not be guessed at.
  const lenient = reconcile({ fields: { ...OURS, village: "रामपुर खुर्द " }, sources: [row()], now: NOW });
  assert.equal(lenient.matched.length, 1);
  const strict = reconcile({ fields: { ...OURS, khasraNumber: "142/8" }, sources: [row()], now: NOW });
  assert.equal(strict.status, "NOT_FOUND");
});
