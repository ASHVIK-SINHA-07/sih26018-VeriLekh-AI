import { strict as assert } from "node:assert";
import { test } from "node:test";
import { categoriesOf, tallyRecords } from "@/lib/error-stats";
import type { ValidationIssue } from "@/types";

/**
 * The dashboard's error statistics. The number a supervisor needs is how many
 * *records* have each kind of problem, so a record with three missing fields
 * is one record with missing fields.
 */

const issue = (kind: ValidationIssue["kind"], field = "ownerName"): ValidationIssue =>
  ({ field, kind, issue: "" }) as ValidationIssue;

test("a record counts once per category, however many findings it has", () => {
  const counts = tallyRecords([[issue("missing", "tehsil"), issue("missing", "village"), issue("missing", "district")]]);
  assert.equal(counts.missing, 1);
});

test("related kinds share a category", () => {
  const found = categoriesOf([issue("ownerConflict"), issue("ownerVariant"), issue("sourceStale")]);
  assert.deepEqual([...found].sort(), ["otherSystems", "ownerMismatch"]);
});

test("records are tallied separately, and untouched categories stay at zero", () => {
  const counts = tallyRecords([[issue("duplicate")], [issue("duplicate"), issue("confidence")], []]);
  assert.equal(counts.duplicateParcel, 2);
  assert.equal(counts.lowConfidence, 1);
  assert.equal(counts.chain, 0);
});

test("a finding without a kind is not counted as any problem", () => {
  assert.equal(categoriesOf([{ field: "x", issue: "?" } as ValidationIssue]).size, 0);
});
