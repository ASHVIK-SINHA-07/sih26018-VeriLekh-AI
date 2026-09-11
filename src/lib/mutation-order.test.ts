import { strict as assert } from "node:assert";
import { test } from "node:test";
import type { OcrResult } from "@/lib/ocr";
import { extractFields } from "@/lib/extract";
import type { MutationRow } from "@/lib/chain";
import {
  classifyDocument, extractMutationOrder, normaliseShare, parseMutationType,
  parseOrderDate, validateMutationOrder, type MutationFields,
} from "@/lib/mutation-order";

function ocrFrom(lines: [string, number][]): OcrResult {
  return {
    rawText: lines.map(([t]) => t).join("\n"),
    language: "hin",
    blocks: lines.map(([text, confidence]) => ({ text, confidence })),
  };
}

/** A दाखिल-खारिज order as the recogniser returns it — matras reordered in places. */
const ORDER = ocrFrom([
  ["दाखिल खारिज आदेश", 0.95],
  ["राजस्व विभाग · उत्तर प्रदेश", 0.9],
  ["दाखिल खारिज संख्या 1204/2026", 0.93],
  ["आदेश दिनांक 14/08/2026", 0.94],
  ["जलि लखनऊ", 0.9],
  ["तहसील मलहिबाद", 0.88],
  ["ग्राम भगवंतपुर", 0.9],
  ["खसरा संख्या 58/1", 0.92],
  ["अंतरण का प्रकार विक्रय", 0.91],
  ["हस्तांतरणकर्ता सुनीता देवी मिश्रा", 0.9],
  ["प्राप्तकर्ता रवि शंकर पाण्डेय", 0.89],
  ["अंतरित अंश सम्पूर्ण", 0.9],
]);

/* ---------------------------------------------------------- classifier */

test("a page headed दाखिल-खारिज is a mutation order", () => {
  assert.equal(classifyDocument(ORDER).kind, "MUTATION_ORDER");
});

test("the heading is recognised however the dash was read", () => {
  for (const head of ["दाखिल-खारिज आदेश", "दाखिल -- खारिज आदेश", "नामांतरण आदेश"]) {
    assert.equal(classifyDocument(ocrFrom([[head, 0.9]])).kind, "MUTATION_ORDER", head);
  }
});

test("a khatauni is a khatauni", () => {
  const page = ocrFrom([["अधिकार अभिलेख — खतौनी", 0.95], ["खसरा संख्या 142/3", 0.9]]);
  assert.equal(classifyDocument(page).kind, "KHATAUNI");
});

test("a khatauni that mentions a mutation in its remarks is still a khatauni", () => {
  // Only a mutation order is *headed* as one; remarks far down the page do not count.
  const page = ocrFrom([
    ["अधिकार अभिलेख — खतौनी", 0.95], ["राजस्व विभाग", 0.9], ["जिला वाराणसी", 0.9],
    ["खसरा संख्या 142/3", 0.9], ["टिप्पणी: दाखिल खारिज 406/2012 द्वारा", 0.8],
  ]);
  assert.equal(classifyDocument(page).kind, "KHATAUNI");
});

/* ------------------------------------------------------------- reading */

test("every field of an order is read", () => {
  const { fields } = extractMutationOrder(ORDER);
  assert.equal(fields.mutationNumber, "1204/2026");
  assert.equal(fields.orderDate, "14/08/2026");
  assert.equal(fields.mutationType, "विक्रय");
  assert.equal(fields.fromOwner, "सुनीता देवी मिश्रा");
  assert.equal(fields.toOwner, "रवि शंकर पाण्डेय");
  assert.equal(fields.share, "सम्पूर्ण");
  assert.equal(fields.khasraNumber, "58/1");
  assert.equal(fields.village, "भगवंतपुर");
  assert.equal(fields.district, "लखनऊ");
});

test("a label is never matched as the tail of a longer word", () => {
  // क्रेता (buyer) is the tail of हस्तांतरणकर्ता (transferor). Before labels
  // had to start a word, the buyer field read the seller's line.
  const page = ocrFrom([["हस्तांतरणकर्ता सुनीता देवी", 0.9], ["क्रेता रवि शंकर", 0.9]]);
  const { fields } = extractMutationOrder(page);
  assert.equal(fields.fromOwner, "सुनीता देवी");
  // क्रेता is not one of our transferee labels, so nothing is read — but the
  // seller's line must not be mistaken for it either.
  assert.notEqual(fields.toOwner, "सुनीता देवी");
});

test("the khatauni reader is unchanged by the shared engine", () => {
  const page = ocrFrom([["जिला वाराणसी", 0.9], ["खसरा संख्या 142/3", 0.9], ["स्वामी का नाम राजेश कुमार वर्मा", 0.9]]);
  const { fields } = extractFields(page);
  assert.equal(fields.district, "वाराणसी");
  assert.equal(fields.khasraNumber, "142/3");
  assert.equal(fields.ownerName, "राजेश कुमार वर्मा");
});

/* ------------------------------------------------------------- parsing */

test("transfer types are read as written on an order", () => {
  assert.equal(parseMutationType("विक्रय"), "SALE");
  assert.equal(parseMutationType("वरासत"), "INHERITANCE");
  assert.equal(parseMutationType("दान"), "GIFT");
  assert.equal(parseMutationType("बंटवारा"), "PARTITION");
  assert.equal(parseMutationType("न्यायालय आदेश"), "DECREE");
  assert.equal(parseMutationType("कुछ और"), null);
});

test("order dates are day-first, and impossible dates are refused", () => {
  assert.equal(parseOrderDate("14/08/2026")?.toISOString().slice(0, 10), "2026-08-14");
  assert.equal(parseOrderDate("14.08.2026")?.toISOString().slice(0, 10), "2026-08-14");
  assert.equal(parseOrderDate("31/02/2026"), null);
  assert.equal(parseOrderDate("2026-08-14"), null);
});

test("the recogniser's actual misreadings on the seeded orders still parse", () => {
  // Measured on the seeded scans through the real OCR service.
  assert.equal(normaliseShare("समपूरण"), "1", "सम्पूर्ण with its matras reordered");
  assert.equal(parseMutationType("वकिरिय"), "SALE", "विक्रय with its matras reordered");
});

test("a whole share written in words is the whole parcel", () => {
  assert.equal(normaliseShare("सम्पूर्ण"), "1");
  assert.equal(normaliseShare("1/2"), "1/2");
  assert.equal(normaliseShare("आधा"), null);
});

/* ---------------------------------------------------------- validation */

const on = (iso: string) => new Date(`${iso}T00:00:00Z`);
const NOW = on("2026-09-11");
const REGISTER: MutationRow[] = [
  { id: "b1", seq: 1, mutationNumber: "77/2006", type: "ORIGINAL", fromOwner: null, toOwner: "रामनाथ मिश्रा", share: "1", effectiveDate: on("2006-04-12"), recordedAt: NOW, supersedesId: null },
  { id: "b2", seq: 2, mutationNumber: "52/2014", type: "INHERITANCE", fromOwner: "रामनाथ मिश्रा", toOwner: "सुनीता देवी मिश्रा", share: "1", effectiveDate: on("2014-01-20"), recordedAt: NOW, supersedesId: null },
  { id: "b3", seq: 3, mutationNumber: null, type: "SALE", fromOwner: "सुनीता देवी मिश्रा", toOwner: "अनिल कुमार मिश्रा", share: "1", effectiveDate: on("2025-11-28"), recordedAt: NOW, supersedesId: null },
];

function fieldsOf(over: Partial<MutationFields> = {}): MutationFields {
  return { ...extractMutationOrder(ORDER).fields, ...over };
}

test("an order selling land its seller already sold is caught before it enters the register", () => {
  const v = validateMutationOrder({ fields: fieldsOf(), confidence: {}, existing: REGISTER, now: NOW });
  assert.equal(v.status, "FLAGGED");
  const double = v.introduced.find((f) => f.kind === "doubleSale");
  assert.ok(double, JSON.stringify(v.introduced));
  assert.match(double.message, /अनिल कुमार मिश्रा/);
  // The register itself is unchanged — this is a preview, not an entry.
  assert.equal(v.before.steps.length, 3);
  assert.equal(v.after?.steps.length, 4);
});

test("a sound order passes and shows the chain it would produce", () => {
  const v = validateMutationOrder({
    fields: fieldsOf({ fromOwner: "अनिल कुमार मिश्रा" }),
    confidence: {}, existing: REGISTER, now: NOW,
  });
  assert.equal(v.status, "PASS", JSON.stringify(v.issues));
  assert.deepEqual(v.after?.currentHolders.map((h) => h.owner), ["रवि शंकर पाण्डेय"]);
  assert.equal(v.candidate?.seq, 4);
});

test("a defect already in the register is not blamed on a new order", () => {
  // The register already has a problem; a sound new order must not inherit it.
  const broken: MutationRow[] = [
    ...REGISTER,
    { id: "b4", seq: 4, mutationNumber: null, type: "SALE", fromOwner: "सुनीता देवी मिश्रा", toOwner: "मोहन", share: "1", effectiveDate: on("2025-12-15"), recordedAt: NOW, supersedesId: null },
  ];
  const v = validateMutationOrder({
    fields: fieldsOf({ fromOwner: "अनिल कुमार मिश्रा" }),
    confidence: {}, existing: broken, now: NOW,
  });
  assert.equal(v.before.status, "DEFECTS");
  assert.equal(v.introduced.length, 0, JSON.stringify(v.introduced));
});

test("an order for a parcel with no digitised history is accepted as its first entry", () => {
  const v = validateMutationOrder({ fields: fieldsOf(), confidence: {}, existing: [], now: NOW });
  // The seller cannot be checked against a history that is not on file.
  assert.equal(v.before.status, "EMPTY");
  assert.ok(v.candidate);
});

test("an unreadable type, date or share is named, not guessed", () => {
  const v = validateMutationOrder({
    fields: fieldsOf({ mutationType: "अस्पष्ट", orderDate: "31/02/2026", share: "आधा" }),
    confidence: {}, existing: REGISTER, now: NOW,
  });
  assert.equal(v.status, "FLAGGED");
  assert.equal(v.candidate, null, "nothing that cannot be parsed is ever previewed as an entry");
  for (const field of ["mutationType", "orderDate", "share"]) {
    assert.ok(v.issues.some((i) => i.field === field), field);
  }
});
