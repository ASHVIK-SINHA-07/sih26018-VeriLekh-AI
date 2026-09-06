/**
 * Synthetic seed — docs/01_PRD.md data-privacy rule.
 *
 * Everything written here is FAKE: invented names, invented survey numbers,
 * realistic in format only. Never load real citizens' ownership records.
 *
 * Re-runnable: documents are wiped and rebuilt on every run, users are
 * upserted. The launch checklist asks for the database to be returned to a
 * known clean state with the planted errors intact before a demo, and
 * `npx prisma db seed` does exactly that.
 *
 * Runs on Node's native TypeScript support (CLAUDE.md D12), so imports here
 * are package or relative-with-extension only — the `@/*` alias is a tsconfig
 * feature Node does not resolve.
 */
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { PrismaClient, type Role } from "@prisma/client";
import bcrypt from "bcryptjs";
import { SEED_DOCS, type SeedDoc } from "./seed-data.ts";
import { renderKhatauniScan } from "./seed-scan.ts";

const db = new PrismaClient();

const BCRYPT_ROUNDS = 12;
/** Matches LOW_CONFIDENCE_THRESHOLD in src/types/index.ts. */
const LOW_CONFIDENCE = 0.75;
const UPLOAD_DIR = process.env.UPLOAD_DIR ?? "./uploads";
const SCAN_SUBDIR = "seed";

/** Demo accounts — local development only. */
const USERS: { email: string; name: string; role: Role; password: string }[] = [
  { email: "admin@revenue.gov.in", name: "Sunita Rao", role: "ADMIN", password: "Admin@12345" },
  { email: "verifier@revenue.gov.in", name: "Rajesh Kumar", role: "VERIFIER", password: "Verify@12345" },
  { email: "viewer@revenue.gov.in", name: "Anil Deshpande", role: "VIEWER", password: "Viewer@12345" },
];

function daysAgo(days: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d;
}

async function seedUsers(): Promise<Record<"ADMIN" | "VERIFIER", string>> {
  const ids: Record<string, string> = {};
  for (const user of USERS) {
    const passwordHash = await bcrypt.hash(user.password, BCRYPT_ROUNDS);
    const row = await db.user.upsert({
      where: { email: user.email },
      update: { name: user.name, role: user.role, passwordHash },
      create: { email: user.email, name: user.name, role: user.role, passwordHash },
    });
    ids[user.role] = row.id;
  }
  return ids as Record<"ADMIN" | "VERIFIER", string>;
}

/** Values drawn on the scan for a document whose extraction has not run yet. */
const UNEXTRACTED_SCAN = {
  district: "कानपुर नगर", tehsil: "बिल्हौर", village: "टिकरी",
  khataNumber: "—", khasraNumber: "—", surveyNumber: "—",
  ownerName: "—", plotArea: "—", landClassification: "—",
};

async function writeScan(doc: SeedDoc, scanDir: string): Promise<string> {
  const f = doc.fields;
  const fields = f
    ? {
        district: f.district ?? "—", tehsil: f.tehsil ?? "—", village: f.village ?? "—",
        khataNumber: f.khataNumber ?? "—", khasraNumber: f.khasraNumber ?? "—",
        surveyNumber: f.surveyNumber ?? "—", ownerName: f.ownerName ?? "—",
        plotArea: f.plotArea ?? "—", landClassification: f.landClassification ?? "—",
        fasliYear: doc.fasliYear,
      }
    : { ...UNEXTRACTED_SCAN, fasliYear: doc.fasliYear };

  // A field the pipeline was unsure about is drawn faint and smudged, so the
  // scan visibly explains its own low confidence score.
  const faded = Object.entries(doc.confidence)
    .filter(([, score]) => score < LOW_CONFIDENCE)
    .map(([name]) => name);

  const seed = doc.key.split("").reduce((n, c) => n + c.charCodeAt(0), 0);
  const svg = renderKhatauniScan(fields, faded, seed);
  await writeFile(path.join(scanDir, doc.filename), svg, "utf8");

  return path.posix.join(UPLOAD_DIR.replace(/^\.\//, ""), SCAN_SUBDIR, doc.filename);
}

async function seedDocuments(userIds: Record<"ADMIN" | "VERIFIER", string>) {
  // Wipe in FK order — children before parents.
  await db.learnedCorrection.deleteMany();
  await db.auditLog.deleteMany();
  await db.validationResult.deleteMany();
  await db.extractedRecord.deleteMany();
  await db.document.deleteMany();

  const scanDir = path.join(UPLOAD_DIR, SCAN_SUBDIR);
  await rm(scanDir, { recursive: true, force: true });
  await mkdir(scanDir, { recursive: true });

  const idByKey = new Map<string, string>();

  // Pass 1 — documents, records and audit entries.
  for (const doc of SEED_DOCS) {
    const filePath = await writeScan(doc, scanDir);
    const created = daysAgo(doc.daysAgo);

    const row = await db.document.create({
      data: {
        filename: doc.filename,
        filePath,
        status: doc.status,
        uploadedById: userIds[doc.uploadedBy],
        createdAt: created,
        updatedAt: created,
      },
    });
    idByKey.set(doc.key, row.id);

    if (doc.fields) {
      await db.extractedRecord.create({
        data: {
          documentId: row.id,
          ...doc.fields,
          ulpin: doc.ulpin,
          confidence: doc.confidence,
          createdAt: created,
          updatedAt: created,
        },
      });
    }

    for (const entry of doc.audit) {
      await db.auditLog.create({
        data: {
          documentId: row.id,
          actorId: userIds[entry.by],
          action: entry.action,
          timestamp: daysAgo(entry.daysAgo),
        },
      });
    }
  }

  // Pass 2 — validation, once every id exists so duplicateOf can resolve.
  for (const doc of SEED_DOCS) {
    if (!doc.validation) continue;
    const documentId = idByKey.get(doc.key)!;
    const duplicateOfId = doc.validation.duplicateOfKey
      ? (idByKey.get(doc.validation.duplicateOfKey) ?? null)
      : null;

    await db.validationResult.create({
      data: {
        documentId,
        status: doc.validation.status,
        issues: doc.validation.issues,
        duplicateOfId,
        createdAt: daysAgo(doc.daysAgo),
      },
    });
  }

  return idByKey;
}

async function main() {
  const userIds = await seedUsers();
  await seedDocuments(userIds);

  const counts = await db.document.groupBy({ by: ["status"], _count: true });
  const planted = SEED_DOCS.filter((d) => d.note?.startsWith("PLANTED"));

  console.log(`\nSeeded ${USERS.length} users. Log in with:\n`);
  for (const user of USERS) {
    console.log(`  ${user.role.padEnd(8)}  ${user.email.padEnd(26)}  ${user.password}`);
  }

  /* ------------------------------------------- what the system already knows
   * Corrections officers made during earlier verification rounds. These are
   * real misreadings, taken from the measured backtest — Tesseract transposes
   * matras and does it consistently on the same words.
   *
   * Deliberately none of the planted demo problems: the demo is meant to show
   * an officer *teaching* the system something new, which only works if that
   * particular correction has not been learned already.
   */
  const LEARNED: { field: string; wrongValue: string; rightValue: string; occurrences: number }[] = [
    { field: "tehsil", wrongValue: "पडिरा", rightValue: "पिंडरा", occurrences: 4 },
    { field: "village", wrongValue: "टकिरी", rightValue: "टिकरी", occurrences: 3 },
    { field: "ownerName", wrongValue: "राम नरेश तविारी", rightValue: "राम नरेश तिवारी", occurrences: 2 },
    { field: "village", wrongValue: "देवरीखस", rightValue: "देवरीखास", occurrences: 2 },
    { field: "district", wrongValue: "गोरखपरु", rightValue: "गोरखपुर", occurrences: 1 },
  ];
  await db.learnedCorrection.createMany({
    data: LEARNED.map((c) => ({ ...c, applied: Math.max(0, c.occurrences - 1) })),
  });

  console.log(`\nSeeded ${SEED_DOCS.length} synthetic documents:`);
  for (const c of counts.sort((a, b) => a.status.localeCompare(b.status))) {
    console.log(`  ${c.status.padEnd(11)} ${c._count}`);
  }

  console.log(`\nPlanted problems for the demo (${planted.length}):`);
  for (const doc of planted) {
    console.log(`  ${doc.filename.padEnd(32)} ${doc.note?.replace(/^PLANTED #\d+ — /, "")}`);
  }

  const learned = await db.learnedCorrection.aggregate({ _sum: { occurrences: true, applied: true } });
  console.log(`\nSeeded ${LEARNED.length} learned corrections (${learned._sum.occurrences} officer corrections, applied ${learned._sum.applied} times).`);

  console.log("\nAll data is synthetic. Local development only.\n");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
