import { strict as assert } from "node:assert";
import { test } from "node:test";
import { en } from "@/i18n/messages/en";
import { hi } from "@/i18n/messages/hi";
import { mr } from "@/i18n/messages/mr";
import { bn } from "@/i18n/messages/bn";
import { pa } from "@/i18n/messages/pa";
import { createT, renderFinding } from "@/i18n/translate";

/**
 * The translations.
 *
 * TypeScript already refuses a catalogue with a key missing. What it cannot
 * see is inside the strings: a translation that drops `{count}` shows no
 * number, and one that misspells `{district}` shows the braces. These tests
 * read every sentence in every language and compare its placeholders with
 * the English.
 */

const CATALOGUES = { hi, mr, bn, pa };

function leaves(node: unknown, path = ""): [string, string][] {
  if (typeof node === "string") return [[path, node]];
  return Object.entries(node as Record<string, unknown>).flatMap(([k, v]) =>
    leaves(v, path ? `${path}.${k}` : k),
  );
}

const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

for (const [name, catalogue] of Object.entries(CATALOGUES)) {
  test(`${name}: every sentence keeps the English placeholders`, () => {
    const theirs = new Map(leaves(catalogue));
    for (const [key, english] of leaves(en)) {
      const translated = theirs.get(key);
      assert.ok(translated !== undefined, `${name} is missing ${key}`);
      // A plural's "one" form may say "1" in words instead of {count}.
      const expected = placeholders(english).filter((p) => !(key.endsWith(".one") && p === "count"));
      const got = placeholders(translated).filter((p) => !(key.endsWith(".one") && p === "count"));
      assert.deepEqual(got, expected, `${name} ${key}: "${translated}"`);
    }
  });

  test(`${name}: nothing is left untranslated by accident`, () => {
    // Strings that are the same in every language: codes and acronyms.
    const SAME = new Set(["common.ulpin"]);
    const theirs = new Map(leaves(catalogue));
    for (const [key, english] of leaves(en)) {
      if (SAME.has(key) || !/[a-z]{3}/.test(english)) continue;
      assert.notEqual(theirs.get(key), english, `${name} ${key} is still English`);
    }
  });
}

test("a plural picks its form by count", () => {
  const t = createT("en");
  assert.equal(t("upload.batchCount", { count: 1 }), "1 file");
  assert.equal(t("upload.batchCount", { count: 3 }), "3 files");
});

test("a finding with a code is written in the reader's language, values localised", () => {
  const t = createT("hi");
  const text = renderFinding(t, "hi", {
    issue: "Khasra number is missing",
    code: "missing",
    params: { field: "khasraNumber" },
  });
  assert.equal(text, "खसरा संख्या नहीं मिला");
});

test("a finding without a code falls back to its English sentence", () => {
  const t = createT("pa");
  assert.equal(renderFinding(t, "pa", { issue: "Something unforeseen" }), "Something unforeseen");
});

test("dates in findings are written as dates, not ISO strings", () => {
  const t = createT("en");
  const text = renderFinding(t, "en", {
    message: "",
    code: "futureDated",
    params: { seq: 4, date: "2031-03-01" },
  });
  assert.match(text, /1 Mar 2031/);
  assert.doesNotMatch(text, /2031-03-01/);
});
