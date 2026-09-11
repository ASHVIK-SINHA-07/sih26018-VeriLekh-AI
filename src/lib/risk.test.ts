import { strict as assert } from "node:assert";
import { test } from "node:test";
import { summarizeDistrictRisk, type RecordRisk } from "@/lib/risk";

function record(overrides: Partial<RecordRisk> = {}): RecordRisk {
  return {
    district: "वाराणसी",
    quality: { score: 92, band: "HIGH" },
    reconciliation: { status: "AGREES", matched: ["ROR"] },
    chain: { status: "CLEAN", findings: [] },
    ...overrides,
  };
}

test("groups by district and counts each once", () => {
  const rows = summarizeDistrictRisk([
    record({ district: "वाराणसी" }),
    record({ district: "वाराणसी" }),
    record({ district: "गोरखपुर" }),
  ]);
  assert.equal(rows.length, 2);
  const varanasi = rows.find((r) => r.district === "वाराणसी");
  assert.equal(varanasi?.recordCount, 2);
});

test("mean quality is rounded", () => {
  const rows = summarizeDistrictRisk([
    record({ quality: { score: 91, band: "HIGH" } }),
    record({ quality: { score: 92, band: "HIGH" } }),
  ]);
  // mean is 91.5
  assert.equal(rows[0].meanQuality, 92);
});

test("a record never matched to an external source does not count toward reconciled", () => {
  const rows = summarizeDistrictRisk([
    record({ reconciliation: { status: "NOT_FOUND", matched: [] } }),
    record({ reconciliation: { status: "NOT_FOUND", matched: [] } }),
  ]);
  assert.equal(rows[0].reconciled, 0);
  assert.equal(rows[0].reconciliationConflictRate, 0, "0 of 0 is 0, not NaN");
});

test("reconciliation conflict rate is of records checked, not of all records", () => {
  const rows = summarizeDistrictRisk([
    record({ reconciliation: { status: "CONFLICTS", matched: ["ROR"] } }),
    record({ reconciliation: { status: "AGREES", matched: ["ROR"] } }),
    // Two more records nothing was found for — must not dilute the rate.
    record({ reconciliation: { status: "NOT_FOUND", matched: [] } }),
    record({ reconciliation: { status: "NOT_FOUND", matched: [] } }),
  ]);
  assert.equal(rows[0].reconciled, 2);
  assert.equal(rows[0].reconciliationConflicts, 1);
  assert.equal(rows[0].reconciliationConflictRate, 0.5, "1 of 2 checked, not 1 of 4 total");
});

test("a warning-only chain defect does not count as critical", () => {
  const rows = summarizeDistrictRisk([
    record({
      chain: {
        status: "DEFECTS",
        findings: [{ kind: "backdated", severity: "warning", message: "x" }],
      },
    }),
  ]);
  assert.equal(rows[0].chainDefects, 1);
  assert.equal(rows[0].criticalChainDefects, 0);
  assert.equal(rows[0].chainDefectRate, 0, "warning-only defects don't drive the field-verification rate");
});

test("a critical chain defect counts toward the defect rate", () => {
  const rows = summarizeDistrictRisk([
    record({
      chain: {
        status: "DEFECTS",
        findings: [{ kind: "doubleSale", severity: "critical", message: "x" }],
      },
    }),
    record(), // clean, traced
  ]);
  assert.equal(rows[0].chainsTraced, 2);
  assert.equal(rows[0].criticalChainDefects, 1);
  assert.equal(rows[0].chainDefectRate, 0.5);
});

test("a record with no mutation history at all does not count toward chainsTraced", () => {
  const rows = summarizeDistrictRisk([
    record({ chain: { status: "EMPTY", findings: [] } }),
  ]);
  assert.equal(rows[0].chainsTraced, 0);
  assert.equal(rows[0].chainDefectRate, 0);
});

test("needsFieldVerification is the union of low quality, reconciliation conflict, or a critical chain defect", () => {
  const rows = summarizeDistrictRisk([
    record({ quality: { score: 55, band: "LOW" } }),
    record({ reconciliation: { status: "CONFLICTS", matched: ["REGISTRATION"] } }),
    record({
      chain: { status: "DEFECTS", findings: [{ kind: "doubleSale", severity: "critical", message: "x" }] },
    }),
    record(), // clean on all three — not counted
  ]);
  assert.equal(rows[0].needsFieldVerification, 3);
});

test("a LOW score from a badly read page alone is a rescan, not a field visit", () => {
  const rows = summarizeDistrictRisk([
    // Nothing contradicts it — the page simply read badly.
    record({ quality: { score: 40, band: "LOW" }, contradicted: false }),
    // LOW because another record or system contradicts it.
    record({ quality: { score: 60, band: "LOW" }, contradicted: true }),
  ]);
  assert.equal(rows[0].needsFieldVerification, 1);
  assert.equal(rows[0].lowQualityCount, 2, "still counted as low quality, just not as a field visit");
});

test("a record flagged on two counts is still only counted once", () => {
  const rows = summarizeDistrictRisk([
    record({
      quality: { score: 55, band: "LOW" },
      reconciliation: { status: "CONFLICTS", matched: ["REGISTRATION"] },
    }),
  ]);
  assert.equal(rows[0].needsFieldVerification, 1);
});

test("districts are sorted worst-first by records needing field verification", () => {
  const rows = summarizeDistrictRisk([
    record({ district: "clean", quality: { score: 95, band: "HIGH" } }),
    record({ district: "bad", quality: { score: 50, band: "LOW" } }),
    record({ district: "bad", quality: { score: 50, band: "LOW" } }),
  ]);
  assert.deepEqual(rows.map((r) => r.district), ["bad", "clean"]);
});

test("an empty input returns an empty table, not an error", () => {
  assert.deepEqual(summarizeDistrictRisk([]), []);
});
