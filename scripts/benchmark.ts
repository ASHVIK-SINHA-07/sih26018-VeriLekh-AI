/**
 * The canonical accuracy benchmark. Every number quoted in the README, the
 * deck, or to a judge must come from this script and nowhere else.
 *
 *   npm run benchmark            print the report
 *   npm run benchmark -- --json  also write benchmark-results.json
 *
 * It reads the seeded corpus, runs the real OCR service over every scan, and
 * compares the extracted fields against the ground truth in prisma/seed-data.ts.
 * Nothing is mocked; a run takes a few minutes because it is doing the actual
 * work.
 *
 * Two experiments:
 *
 *   1. Extraction accuracy over the whole corpus — populated, exact, and how
 *      many of the *wrong* fields were flagged for a human.
 *
 *   2. The correction-memory experiment, held out. The corpus is split by
 *      document (never by field, which would leak a page into its own test
 *      set); corrections are learned from the training half only, then applied
 *      to the held-out half and scored again.
 *
 * The split is deterministic — first half trains, second half tests, in the
 * order documents appear in seed-data.ts — so two runs on the same corpus and
 * commit produce the same numbers.
 */
import { writeFileSync } from "node:fs";
import { runOcr } from "@/lib/ocr";
import { extractFields } from "@/lib/extract";
import { learnable } from "@/lib/learning";
import { LOW_CONFIDENCE_THRESHOLD, type ExtractedFieldName } from "@/types";
import { SEED_DOCS } from "../prisma/seed-data.ts";
import { SEED_MUTATION_ORDERS } from "../prisma/seed-mutation-orders.ts";
import {
  classifyDocument, extractMutationOrder, normaliseShare, parseMutationType, parseOrderDate,
  MUTATION_FIELD_NAMES, type MutationFieldName,
} from "@/lib/mutation-order";
import { compareNames } from "@/lib/similarity";
import { SATBARA_FILENAME, SATBARA_TRUTH } from "../prisma/seed-multilingual.ts";

const FIELDS: ExtractedFieldName[] = [
  "ownerName", "surveyNumber", "khasraNumber", "khataNumber", "plotArea",
  "village", "tehsil", "district", "landClassification",
];

const docs = SEED_DOCS.filter((d) => d.fields);
const key = (v: string) => v.trim().toLowerCase();

/** Ground-truth field lookup. SeedFields is a declared interface, so it needs
 *  widening before it can be indexed by a field name from the list above. */
const truthOf = (d: (typeof docs)[number], f: ExtractedFieldName): string | null =>
  (d.fields as unknown as Record<string, string | null>)[f] ?? null;

type Read = { key: string; fields: Record<string, string | null>; conf: Record<string, number | undefined>; kind: string };

async function read(d: (typeof docs)[number]): Promise<Read> {
  const ocr = await runOcr(`uploads/seed/${d.filename}`);
  const { fields, confidence } = extractFields(ocr);
  return { key: d.key, fields: fields as never, conf: confidence as never, kind: classifyDocument(ocr).kind };
}

const { isMockOcr } = await import("@/lib/ocr");
if (isMockOcr()) {
  console.error(
    "\nREFUSING TO RUN: OCR_SERVICE_URL is not set, so this would measure the\n" +
    "mock engine rather than Tesseract. Run it as:\n\n" +
    "  OCR_SERVICE_URL=http://localhost:8001 npm run benchmark\n",
  );
  process.exit(1);
}
process.stdout.write(`Reading ${docs.length} documents through the OCR service`);
const reads: Read[] = [];
for (const d of docs) {
  reads.push(await read(d));
  process.stdout.write(".");
}
process.stdout.write("\n\n");

/* ------------------------------------------- 1. extraction accuracy ---- */

let total = 0, populated = 0, exact = 0, wrong = 0, wrongFlagged = 0;
const perField: Record<string, { n: number; ok: number }> = {};

for (const d of docs) {
  const r = reads.find((x) => x.key === d.key)!;
  for (const f of FIELDS) {
    const truth = truthOf(d, f);
    if (truth == null) continue;          // not on this document; nothing to score
    const got = r.fields[f];
    total++;
    perField[f] ??= { n: 0, ok: 0 };
    perField[f].n++;
    if (got != null && got !== "") populated++;
    if (got === truth) { exact++; perField[f].ok++; }
    else {
      wrong++;
      // "Flagged" means a human is shown this field: its confidence fell below
      // the review threshold, or nothing was extracted at all.
      const c = r.conf[f];
      if (got == null || got === "" || c == null || c < LOW_CONFIDENCE_THRESHOLD) wrongFlagged++;
    }
  }
}

const pct = (a: number, b: number) => (b === 0 ? 0 : Math.round((a / b) * 100));

console.log("EXTRACTION ACCURACY");
console.log(`  corpus              ${docs.length} documents, ${total} ground-truth fields`);
console.log(`  populated           ${populated}/${total}  ${pct(populated, total)}%`);
console.log(`  exactly correct     ${exact}/${total}  ${pct(exact, total)}%`);
console.log(`  wrong but flagged   ${wrongFlagged}/${wrong}  ${pct(wrongFlagged, wrong)}%`);
console.log("\n  per field");
for (const [f, s] of Object.entries(perField).sort((a, b) => b[1].ok / b[1].n - a[1].ok / a[1].n)) {
  console.log(`    ${f.padEnd(20)} ${String(s.ok).padStart(2)}/${String(s.n).padEnd(2)}  ${String(pct(s.ok, s.n)).padStart(3)}%`);
}

/* -------------------------------- 2. correction memory, held out ------- */

const half = Math.floor(docs.length / 2);
const train = docs.slice(0, half);
const test = docs.slice(half);

// Learn only from the training documents, into a table held in memory.
//
// Deliberately NOT the LearnedCorrection table. Measuring against the live
// store would mean clearing it first, and that would silently destroy the
// demo corrections the seed installs — a benchmark must never be able to
// damage the system it measures. The substitution rule is the same one
// learning.ts applies: keyed on field plus the exact wrong value.
const table = new Map<string, string>();
let taught = 0;
for (const d of train) {
  const r = reads.find((x) => x.key === d.key)!;
  for (const f of FIELDS) {
    const truth = truthOf(d, f);
    const got = r.fields[f];
    if (truth == null || got == null || got === truth) continue;
    if (!learnable(got, truth)) continue;
    table.set(`${f}\u0000${key(got)}`, truth);
    taught++;
  }
}

let baseN = 0, baseOk = 0, afterOk = 0;
const changes: string[] = [];
for (const d of test) {
  const r = reads.find((x) => x.key === d.key)!;
  for (const f of FIELDS) {
    const truth = truthOf(d, f);
    if (truth == null) continue;
    const got = r.fields[f];
    baseN++;
    const was = got === truth;
    if (was) baseOk++;
    const fixed = got == null ? got : (table.get(`${f}\u0000${key(got)}`) ?? got);
    const now = fixed === truth;
    if (now) afterOk++;
    if (!was && now) changes.push(`  + ${d.key} ${f}: "${got}" -> "${fixed}"`);
    if (was && !now) changes.push(`  - ${d.key} ${f}: REGRESSED "${got}" -> "${fixed}"`);
  }
}

console.log("\n\nCORRECTION MEMORY — HELD OUT");
console.log(`  split               train ${train.length} documents / test ${test.length} documents (by document, no page appears in both)`);
console.log(`  officers corrected  ${taught} fields on the training half`);
console.log(`  distinct entries    ${table.size}`);
console.log(`  held-out before     ${baseOk}/${baseN}  ${pct(baseOk, baseN)}%`);
console.log(`  held-out after      ${afterOk}/${baseN}  ${pct(afterOk, baseN)}%`);
console.log(`  net                 ${afterOk - baseOk >= 0 ? "+" : ""}${afterOk - baseOk} fields`);
if (changes.length) { console.log("\n  field-level changes"); changes.forEach((c) => console.log("  " + c)); }

/* ------------------------------- 3. classification and mutation orders -- */

// Every page must be routed to the right reader before any field is read.
const orderReads: { name: string; kind: string; fields: Record<MutationFieldName, string | null> }[] = [];
for (const o of SEED_MUTATION_ORDERS) {
  const ocr = await runOcr(`uploads/seed/${o.filename}`);
  orderReads.push({ name: o.filename, kind: classifyDocument(ocr).kind, fields: extractMutationOrder(ocr).fields });
}
const khataunisRight = reads.filter((r) => r.kind === "KHATAUNI").length;
const ordersRight = orderReads.filter((r) => r.kind === "MUTATION_ORDER").length;

// Two measures, reported side by side. "Exact" is character for character as
// printed. "Usable" is whether the value means the same thing once the
// recogniser's matra reordering is set aside: the same person, the same date,
// the same share, the same kind of transfer — which is what decides whether
// the order can be checked against the chain. Quoting only the second would
// hide how much the officer still has to correct.
const usable = (f: MutationFieldName, got: string | null, truth: string): boolean => {
  if (got == null) return false;
  switch (f) {
    case "mutationType": return parseMutationType(got) !== null && parseMutationType(got) === parseMutationType(truth);
    case "orderDate": return parseOrderDate(got)?.getTime() === parseOrderDate(truth)?.getTime();
    case "share": return normaliseShare(got) !== null && normaliseShare(got) === normaliseShare(truth);
    case "fromOwner": case "toOwner": case "village": case "district":
      return compareNames(got, truth).verdict === "same";
    default: return got.trim() === truth.trim();
  }
};

let mTotal = 0, mExact = 0, mUsable = 0;
const mPerField: Record<string, { n: number; exact: number; usable: number }> = {};
for (const o of SEED_MUTATION_ORDERS) {
  const r = orderReads.find((x) => x.name === o.filename)!;
  for (const f of MUTATION_FIELD_NAMES) {
    const truth = o[f];
    if (truth == null) continue;          // not printed on this order
    const got = r.fields[f];
    mTotal++;
    mPerField[f] ??= { n: 0, exact: 0, usable: 0 };
    mPerField[f].n++;
    if (got === truth) { mExact++; mPerField[f].exact++; }
    if (usable(f, got, truth)) { mUsable++; mPerField[f].usable++; }
  }
}

console.log("\n\nDOCUMENT CLASSIFICATION");
console.log(`  khatauni read as khatauni          ${khataunisRight}/${reads.length}`);
console.log(`  mutation order read as order       ${ordersRight}/${orderReads.length}`);

console.log("\n\nMUTATION ORDERS");
console.log(`  corpus              ${SEED_MUTATION_ORDERS.length} orders, ${mTotal} ground-truth fields`);
console.log(`  exact as printed    ${mExact}/${mTotal}  ${pct(mExact, mTotal)}%`);
console.log(`  usable              ${mUsable}/${mTotal}  ${pct(mUsable, mTotal)}%   (same person, date, share or transfer type)`);
console.log("\n  per field               exact   usable");
for (const f of MUTATION_FIELD_NAMES) {
  const x = mPerField[f];
  console.log(`    ${f.padEnd(20)} ${String(x.exact).padStart(2)}/${x.n}     ${String(x.usable).padStart(2)}/${x.n}`);
}

/* ------------------------------------------------------ 4. multilingual -- */

// One Marathi page, read twice: with the language auto-detected (Tesseract
// can tell the script but not Hindi from Marathi, so it picks Hindi), and with
// Marathi requested explicitly. The difference is what the language parameter
// buys. One page is a demonstration, not an accuracy figure.
const marathi: { mode: string; exact: number; populated: number }[] = [];
for (const [mode, language] of [["auto-detected", undefined], ["language: mar", "mar"]] as const) {
  const { fields } = extractFields(await runOcr(`uploads/seed/${SATBARA_FILENAME}`, language));
  const got = fields as unknown as Record<string, string | null>;
  const keys = Object.keys(SATBARA_TRUTH);
  marathi.push({
    mode,
    exact: keys.filter((k) => got[k] === SATBARA_TRUTH[k]).length,
    populated: keys.filter((k) => got[k]).length,
  });
}
const mFields = Object.keys(SATBARA_TRUTH).length;
console.log("\n\nMULTILINGUAL — one synthetic Marathi 7/12 extract");
for (const r of marathi) {
  console.log(`  ${r.mode.padEnd(18)} ${r.exact}/${mFields} exact, ${r.populated}/${mFields} populated`);
}

if (process.argv.includes("--json")) {
  const out = {
    generatedAt: new Date().toISOString(),
    corpus: { documents: docs.length, groundTruthFields: total },
    extraction: {
      populated, exact, wrong, wrongFlagged,
      populatedPct: pct(populated, total),
      exactPct: pct(exact, total),
      wrongFlaggedPct: pct(wrongFlagged, wrong),
      perField,
    },
    multilingual: { page: SATBARA_FILENAME, fields: mFields, runs: marathi },
    classification: {
      khatauniCorrect: khataunisRight, khatauniTotal: reads.length,
      orderCorrect: ordersRight, orderTotal: orderReads.length,
    },
    mutationOrders: {
      orders: SEED_MUTATION_ORDERS.length, groundTruthFields: mTotal,
      exact: mExact, usable: mUsable,
      exactPct: pct(mExact, mTotal), usablePct: pct(mUsable, mTotal),
      perField: mPerField,
    },
    correctionMemory: {
      trainDocuments: train.length, testDocuments: test.length,
      fieldsCorrectedInTraining: taught, distinctEntries: table.size,
      heldOutFields: baseN, beforeExact: baseOk, afterExact: afterOk,
      beforePct: pct(baseOk, baseN), afterPct: pct(afterOk, baseN),
      netFields: afterOk - baseOk,
    },
  };
  writeFileSync("benchmark-results.json", JSON.stringify(out, null, 2) + "\n");
  console.log("\nwrote benchmark-results.json");
}

