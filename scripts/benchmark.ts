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
import { db } from "@/lib/db";
import { learnable } from "@/lib/learning";
import { LOW_CONFIDENCE_THRESHOLD, type ExtractedFieldName } from "@/types";
import { SEED_DOCS } from "../prisma/seed-data.ts";

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

type Read = { key: string; fields: Record<string, string | null>; conf: Record<string, number | undefined> };

async function read(d: (typeof docs)[number]): Promise<Read> {
  const ocr = await runOcr(`uploads/seed/${d.filename}`);
  const { fields, confidence } = extractFields(ocr);
  return { key: d.key, fields: fields as never, conf: confidence as never };
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

// Learn only from the training documents. The store is cleared first so a
// previous run — or the seeded demo corrections — cannot leak into the result.
await db.learnedCorrection.deleteMany({});
let taught = 0;
for (const d of train) {
  const r = reads.find((x) => x.key === d.key)!;
  for (const f of FIELDS) {
    const truth = truthOf(d, f);
    const got = r.fields[f];
    if (truth == null || got == null || got === truth) continue;
    if (!learnable(got, truth)) continue;
    await db.learnedCorrection.upsert({
      where: { field_wrongValue: { field: f, wrongValue: key(got) } },
      update: { rightValue: truth, occurrences: { increment: 1 } },
      create: { field: f, wrongValue: key(got), rightValue: truth },
    });
    taught++;
  }
}
const learned = await db.learnedCorrection.findMany();
const table = new Map(learned.map((c) => [`${c.field}\u0000${c.wrongValue}`, c.rightValue]));

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
await db.learnedCorrection.deleteMany({});

console.log("\n\nCORRECTION MEMORY — HELD OUT");
console.log(`  split               train ${train.length} documents / test ${test.length} documents (by document, no page appears in both)`);
console.log(`  officers corrected  ${taught} fields on the training half`);
console.log(`  distinct entries    ${learned.length}`);
console.log(`  held-out before     ${baseOk}/${baseN}  ${pct(baseOk, baseN)}%`);
console.log(`  held-out after      ${afterOk}/${baseN}  ${pct(afterOk, baseN)}%`);
console.log(`  net                 ${afterOk - baseOk >= 0 ? "+" : ""}${afterOk - baseOk} fields`);
if (changes.length) { console.log("\n  field-level changes"); changes.forEach((c) => console.log("  " + c)); }

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
    correctionMemory: {
      trainDocuments: train.length, testDocuments: test.length,
      fieldsCorrectedInTraining: taught, distinctEntries: learned.length,
      heldOutFields: baseN, beforeExact: baseOk, afterExact: afterOk,
      beforePct: pct(baseOk, baseN), afterPct: pct(afterOk, baseN),
      netFields: afterOk - baseOk,
    },
  };
  writeFileSync("benchmark-results.json", JSON.stringify(out, null, 2) + "\n");
  console.log("\nwrote benchmark-results.json");
}

await db.$disconnect();
