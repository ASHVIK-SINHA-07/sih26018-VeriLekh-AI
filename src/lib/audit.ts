import { entryHash, verifyChain, type StoredEntry, type ChainVerdict } from "@/lib/provenance";
import { toJson } from "@/lib/json";
import type { Prisma, PrismaClient } from "@prisma/client";
import { db } from "@/lib/db";

/**
 * Writing to the audit trail.
 *
 * Every audit entry goes through here so that none can be written without a
 * chain link. The alternative — creating rows directly — is what makes an
 * "append-only" table a claim rather than a property: a row inserted around
 * the API has no hash, and `verifyChain` reports exactly that.
 *
 * Entries must be appended in order within one transaction, because each
 * one's hash depends on the one before it. That is why this takes the
 * transaction client and writes sequentially rather than returning promises
 * for a `$transaction([...])` array, where the order of evaluation is not
 * ours to control.
 */

type Tx = Prisma.TransactionClient | PrismaClient;

export interface NewAuditEntry {
  documentId: string;
  actorId: string;
  action: "UPLOAD" | "APPROVE" | "REJECT" | "EDIT_FIELD";
  before?: unknown;
  after?: unknown;
}

/**
 * Append entries to a document's chain, in the order given.
 *
 * Reads the current head inside the caller's transaction, so two concurrent
 * verifications of the same document cannot both claim the same sequence
 * number — the unique index on (documentId, seq) is the backstop if they try.
 */
export async function appendAudit(tx: Tx, entries: NewAuditEntry[]): Promise<void> {
  if (entries.length === 0) return;
  const documentId = entries[0].documentId;

  const head = await tx.auditLog.findFirst({
    where: { documentId },
    orderBy: { seq: "desc" },
    select: { seq: true, hash: true },
  });

  let seq = head ? head.seq + 1 : 0;
  let prevHash = head?.hash ?? null;

  for (const entry of entries) {
    const timestamp = new Date();
    const hash = entryHash(
      {
        documentId: entry.documentId,
        actorId: entry.actorId,
        action: entry.action,
        before: entry.before ?? null,
        after: entry.after ?? null,
        timestamp,
      },
      prevHash,
    );

    await tx.auditLog.create({
      data: {
        documentId: entry.documentId,
        actorId: entry.actorId,
        action: entry.action,
        before: entry.before === undefined ? undefined : toJson(entry.before as object),
        after: entry.after === undefined ? undefined : toJson(entry.after as object),
        timestamp,
        seq,
        hash,
        prevHash,
      },
    });

    prevHash = hash;
    seq += 1;
  }
}

/** Verify a document's provenance chain against the stored hashes. */
export async function verifyDocumentChain(documentId: string): Promise<ChainVerdict> {
  const rows = await db.auditLog.findMany({
    where: { documentId },
    orderBy: { seq: "asc" },
  });

  const entries: StoredEntry[] = rows.map((r) => ({
    id: r.id,
    seq: r.seq,
    documentId: r.documentId,
    actorId: r.actorId,
    action: r.action,
    before: r.before ?? null,
    after: r.after ?? null,
    timestamp: r.timestamp,
    hash: r.hash,
    prevHash: r.prevHash,
  }));

  return verifyChain(entries);
}
