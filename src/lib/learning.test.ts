import { strict as assert } from "node:assert";
import { test } from "node:test";
import { learnable } from "@/lib/learning";

/**
 * The guard on what the system is willing to remember.
 *
 * Everything that gets past this predicate is applied automatically to future
 * documents, so the cost of a bad entry is every page that follows carrying
 * the same wrong substitution. These tests pin the cases where remembering
 * would do more harm than repeating the original mistake.
 */

test("learns a genuine Devanagari misreading", () => {
  // The real failure mode measured on the corpus: a transposed matra.
  assert.equal(learnable("मलहिबाद", "मलिहाबाद"), true);
});

test("learns an owner name the officer completed", () => {
  assert.equal(learnable("सुनीता देवी", "सुनीता देवी मिश्रा"), true);
});

test("refuses to learn from a blank original", () => {
  // There is no misreading to key on. Remembering this would mean
  // substituting a value into every future blank field.
  assert.equal(learnable(null, "मलिहाबाद"), false);
  assert.equal(learnable("", "मलिहाबाद"), false);
});

test("refuses to learn a cleared field", () => {
  assert.equal(learnable("मलहिबाद", null), false);
  assert.equal(learnable("मलहिबाद", "   "), false);
});

test("refuses single characters", () => {
  // Remembering that "1" should be "7" would rewrite every other "1".
  assert.equal(learnable("1", "7"), false);
  assert.equal(learnable("क", "फ"), false);
});

test("learns a two-character correction", () => {
  assert.equal(learnable("१२", "12"), true);
});

test("ignores a change that is only whitespace", () => {
  assert.equal(learnable("  रामपुर  ", "रामपुर"), false);
});

test("ignores a change that is only case", () => {
  assert.equal(learnable("rampur", "Rampur"), false);
});

test("a real value replaced by a different real value is learnable", () => {
  assert.equal(learnable("142/3", "142/8"), true);
});
