import { strict as assert } from "node:assert";
import { test } from "node:test";
import { analyseChain, currentMutations, type MutationRow } from "@/lib/chain";
import { add, format, frac, parseShare } from "@/lib/fraction";

/**
 * Each test is a way land records actually go wrong. The chain earns its place
 * only if it catches these — so every one of them is written as the defect,
 * and asserts the engine names it.
 */

const NOW = new Date("2026-09-11T00:00:00Z");
const on = (iso: string) => new Date(`${iso}T00:00:00Z`);
let n = 0;

function m(over: Partial<MutationRow> & Pick<MutationRow, "type" | "toOwner" | "share" | "effectiveDate">): MutationRow {
  n += 1;
  return {
    id: `m${n}`, seq: n, mutationNumber: null, fromOwner: null,
    recordedAt: NOW, supersedesId: null, ...over,
  };
}

/* ------------------------------------------------------------ fractions */

test("thirds add up to exactly one", () => {
  const third = frac(1, 3);
  assert.equal(format(add(add(third, third), third)), "1");
});

test("shares parse as written in a register", () => {
  assert.equal(format(parseShare("1/2")!), "1/2");
  assert.equal(format(parseShare("0.25")!), "1/4");
  assert.equal(format(parseShare("½")!), "1/2");
  assert.equal(format(parseShare("1")!), "1");
  assert.equal(parseShare("half"), null);
  assert.equal(parseShare("1/0"), null);
});

/* --------------------------------------------------------------- chains */

test("a clean twenty-year chain reports CLEAN and ends with the right holder", () => {
  const r = analyseChain({
    mutations: [
      m({ type: "ORIGINAL", toOwner: "रामेश्वर प्रसाद वर्मा", share: "1", effectiveDate: on("2005-03-10") }),
      m({ type: "INHERITANCE", fromOwner: "रामेश्वर प्रसाद वर्मा", toOwner: "राजेश कुमार वर्मा", share: "1/2", effectiveDate: on("2012-07-02") }),
      m({ type: "INHERITANCE", fromOwner: "रामेश्वर प्रसाद वर्मा", toOwner: "सुरेश कुमार वर्मा", share: "1/2", effectiveDate: on("2012-07-02") }),
      m({ type: "SALE", fromOwner: "सुरेश कुमार वर्मा", toOwner: "राजेश कुमार वर्मा", share: "1/2", effectiveDate: on("2019-11-20") }),
    ],
    recordOwner: "राजेश कुमार वर्मा",
    now: NOW,
  });
  assert.equal(r.status, "CLEAN", JSON.stringify(r.findings));
  assert.deepEqual(r.currentHolders.map((h) => [h.owner, h.share]), [["राजेश कुमार वर्मा", "1"]]);
  assert.ok(r.span && r.span.years > 14);
});

test("the same land sold twice is a double sale", () => {
  const r = analyseChain({
    mutations: [
      m({ type: "ORIGINAL", toOwner: "हरिशंकर यादव", share: "1", effectiveDate: on("2008-01-15") }),
      m({ type: "SALE", fromOwner: "हरिशंकर यादव", toOwner: "कमला प्रसाद यादव", share: "1", effectiveDate: on("2016-04-04") }),
      m({ type: "SALE", fromOwner: "हरिशंकर यादव", toOwner: "मोहन लाल गुप्ता", share: "1", effectiveDate: on("2018-09-12") }),
    ],
    now: NOW,
  });
  const f = r.findings.find((x) => x.kind === "doubleSale");
  assert.ok(f, JSON.stringify(r.findings));
  assert.equal(f.severity, "critical");
  assert.match(f.message, /कमला प्रसाद यादव/);
  // The second buyer is never credited — the land was not the seller's to sell.
  assert.deepEqual(r.currentHolders.map((h) => h.owner), ["कमला प्रसाद यादव"]);
});

test("a sale by a holder whose interest passed on death is caught", () => {
  const r = analyseChain({
    mutations: [
      m({ type: "ORIGINAL", toOwner: "गंगा राम तिवारी", share: "1", effectiveDate: on("2005-06-01") }),
      m({ type: "INHERITANCE", fromOwner: "गंगा राम तिवारी", toOwner: "राम नरेश तिवारी", share: "1", effectiveDate: on("2011-02-18") }),
      m({ type: "SALE", fromOwner: "गंगा राम तिवारी", toOwner: "रमेश चंद्र", share: "1/4", effectiveDate: on("2014-08-30") }),
    ],
    now: NOW,
  });
  const f = r.findings.find((x) => x.kind === "deceasedTransferor");
  assert.ok(f, JSON.stringify(r.findings));
  assert.match(f.message, /had died/);
});

test("an entry made later but dated earlier is backdated", () => {
  const r = analyseChain({
    mutations: [
      m({ seq: 1, type: "ORIGINAL", toOwner: "अ", share: "1", effectiveDate: on("2005-01-01") }),
      m({ seq: 2, type: "SALE", fromOwner: "अ", toOwner: "ब", share: "1", effectiveDate: on("2020-01-01") }),
      m({ seq: 3, type: "SALE", fromOwner: "अ", toOwner: "स", share: "1/2", effectiveDate: on("2014-01-01") }),
    ],
    now: NOW,
  });
  assert.ok(r.findings.some((x) => x.kind === "backdated" && x.seq === 3), JSON.stringify(r.findings));
});

test("an inheritance that hands out more than the deceased held is caught", () => {
  const r = analyseChain({
    mutations: [
      m({ type: "ORIGINAL", toOwner: "अब्दुल करीम", share: "1", effectiveDate: on("2007-05-05") }),
      m({ type: "INHERITANCE", fromOwner: "अब्दुल करीम", toOwner: "फातिमा बेगम", share: "1/2", effectiveDate: on("2013-10-10") }),
      m({ type: "INHERITANCE", fromOwner: "अब्दुल करीम", toOwner: "सलमा बेगम", share: "1/3", effectiveDate: on("2013-10-10") }),
      m({ type: "INHERITANCE", fromOwner: "अब्दुल करीम", toOwner: "रशीद अहमद", share: "1/3", effectiveDate: on("2013-10-10") }),
    ],
    now: NOW,
  });
  const f = r.findings.find((x) => x.kind === "sharesExceedWhole");
  assert.ok(f, JSON.stringify(r.findings));
  assert.match(f.message, /7\/6/);
});

test("heirs are settled together, not one at a time", () => {
  // If the first heir's entry removed the deceased, the second heir's entry
  // would look like a transfer by nobody. It must not.
  const r = analyseChain({
    mutations: [
      m({ type: "ORIGINAL", toOwner: "अ", share: "1", effectiveDate: on("2005-01-01") }),
      m({ type: "INHERITANCE", fromOwner: "अ", toOwner: "ब", share: "1/3", effectiveDate: on("2010-01-01") }),
      m({ type: "INHERITANCE", fromOwner: "अ", toOwner: "स", share: "1/3", effectiveDate: on("2010-01-01") }),
      m({ type: "INHERITANCE", fromOwner: "अ", toOwner: "द", share: "1/3", effectiveDate: on("2010-01-01") }),
    ],
    now: NOW,
  });
  assert.equal(r.status, "CLEAN", JSON.stringify(r.findings));
  assert.equal(r.currentHolders.length, 3);
});

test("a seller who never held the parcel is a chain break", () => {
  const r = analyseChain({
    mutations: [
      m({ type: "ORIGINAL", toOwner: "अ", share: "1", effectiveDate: on("2005-01-01") }),
      m({ type: "SALE", fromOwner: "अजनबी", toOwner: "ब", share: "1", effectiveDate: on("2015-01-01") }),
    ],
    now: NOW,
  });
  assert.ok(r.findings.some((x) => x.kind === "chainBreak"));
});

test("selling more than you hold is caught", () => {
  const r = analyseChain({
    mutations: [
      m({ type: "ORIGINAL", toOwner: "अ", share: "1/2", effectiveDate: on("2005-01-01") }),
      m({ type: "ORIGINAL", toOwner: "ब", share: "1/2", effectiveDate: on("2005-01-01") }),
      m({ type: "SALE", fromOwner: "अ", toOwner: "स", share: "1", effectiveDate: on("2015-01-01") }),
    ],
    now: NOW,
  });
  assert.ok(r.findings.some((x) => x.kind === "overTransfer"));
});

test("a chain that ends with someone other than the record's owner is an unrecorded transfer", () => {
  // The un-updated mutation: a sale registered, the Record of Rights never changed.
  const r = analyseChain({
    mutations: [
      m({ type: "ORIGINAL", toOwner: "सुनीता देवी मिश्रा", share: "1", effectiveDate: on("2014-03-03") }),
      m({ type: "SALE", fromOwner: "सुनीता देवी मिश्रा", toOwner: "अनिल कुमार मिश्रा", share: "1", effectiveDate: on("2025-12-01") }),
    ],
    recordOwner: "सुनीता देवी मिश्रा",
    now: NOW,
  });
  const f = r.findings.find((x) => x.kind === "unrecordedTransfer");
  assert.ok(f);
  assert.match(f.message, /अनिल कुमार मिश्रा/);
});

test("a transposed matra in a name does not break the chain", () => {
  // The recogniser's commonest error must not read as a stranger selling land.
  const r = analyseChain({
    mutations: [
      m({ type: "ORIGINAL", toOwner: "राम नरेश तिवारी", share: "1", effectiveDate: on("2005-01-01") }),
      m({ type: "SALE", fromOwner: "राम नरेश तविारी", toOwner: "ब", share: "1", effectiveDate: on("2015-01-01") }),
    ],
    now: NOW,
  });
  assert.equal(r.status, "CLEAN", JSON.stringify(r.findings));
});

test("a future-dated entry is caught", () => {
  const r = analyseChain({
    mutations: [m({ type: "ORIGINAL", toOwner: "अ", share: "1", effectiveDate: on("2030-01-01") })],
    now: NOW,
  });
  assert.ok(r.findings.some((x) => x.kind === "futureDated"));
});

test("a corrected entry is replaced, not replayed — and is kept as history", () => {
  const wrong = m({ type: "ORIGINAL", toOwner: "अ", share: "1/3", effectiveDate: on("2005-01-01") });
  const fixed = m({ type: "ORIGINAL", toOwner: "अ", share: "1", effectiveDate: on("2005-01-01"), supersedesId: wrong.id });
  const { current, superseded } = currentMutations([wrong, fixed]);
  assert.deepEqual(current.map((x) => x.id), [fixed.id]);
  assert.deepEqual(superseded.map((x) => x.id), [wrong.id]);

  const r = analyseChain({ mutations: [wrong, fixed], now: NOW });
  assert.equal(r.currentHolders[0].share, "1");
  assert.equal(r.superseded.length, 1);
});

test("a correction made years later is not mistaken for backdating", () => {
  // The share was mis-transcribed at digitisation and fixed afterwards. The
  // fix is entered last but dated 2012 — it must take the corrected entry's
  // place in the register, not look like history being rewritten.
  const orig = m({ seq: 1, type: "ORIGINAL", toOwner: "अ", share: "1", effectiveDate: on("2005-01-01") });
  const heir1 = m({ seq: 2, type: "INHERITANCE", fromOwner: "अ", toOwner: "ब", share: "1/2", effectiveDate: on("2012-07-02") });
  const heir2 = m({ seq: 3, type: "INHERITANCE", fromOwner: "अ", toOwner: "स", share: "1/3", effectiveDate: on("2012-07-02") });
  const sale = m({ seq: 4, type: "SALE", fromOwner: "स", toOwner: "ब", share: "1/2", effectiveDate: on("2019-11-20") });
  const fix = m({ seq: 5, type: "INHERITANCE", fromOwner: "अ", toOwner: "स", share: "1/2", effectiveDate: on("2012-07-02"), supersedesId: heir2.id });
  const r = analyseChain({ mutations: [orig, heir1, heir2, sale, fix], recordOwner: "ब", now: NOW });
  assert.equal(r.status, "CLEAN", JSON.stringify(r.findings));
  assert.equal(r.superseded.length, 1);
  assert.equal(r.currentHolders[0].share, "1");
});

test("an unreadable share is reported rather than guessed", () => {
  const r = analyseChain({
    mutations: [m({ type: "ORIGINAL", toOwner: "अ", share: "आधा", effectiveDate: on("2005-01-01") })],
    now: NOW,
  });
  assert.ok(r.findings.some((x) => x.kind === "unreadableShare"));
});

test("an empty register is EMPTY, not CLEAN", () => {
  // No history digitised is not the same as a history with nothing wrong.
  assert.equal(analyseChain({ mutations: [], now: NOW }).status, "EMPTY");
});
