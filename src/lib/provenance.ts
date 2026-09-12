import { createHash } from "node:crypto";

/**
 * Tamper-evident provenance for the audit trail.
 *
 * An append-only table is a promise. A hash chain is evidence. Each audit
 * entry carries the SHA-256 of its own content *plus the hash of the entry
 * before it*, so changing any historical entry — or deleting one, or slipping
 * one in — breaks every link after it and the break is detectable without
 * trusting the database.
 *
 * The chain is **per document**, not global. A parcel's history is the unit
 * anyone actually needs to prove: "has this record's trail been altered since
 * it was signed off?" A per-document chain answers that, and it can be built
 * inside the same transaction that writes the entry without serialising every
 * write in the system behind one global head.
 *
 * This is deliberately not a blockchain. Indian evidence and title law treat
 * cryptographic records as tamper-evident verification, never as an
 * independent source of title, and a public ledger would also put land
 * ownership data outside government infrastructure — the opposite of what this
 * system is for. A self-hosted SHA-256 chain gives the integrity property
 * without either problem.
 */

/** Canonical JSON so that key order can never change a hash. */
function canonical(value: unknown): string {
  if (value === null || value === undefined) return "null";
  if (typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(",")}}`;
}

export interface ChainableEntry {
  documentId: string;
  actorId: string;
  action: string;
  before: unknown;
  after: unknown;
  timestamp: Date;
}

/**
 * The hash for one entry, given the hash of the entry before it.
 *
 * `null` for prevHash marks the genesis entry of a document's chain.
 * Everything that identifies the entry goes into the digest: if any of it is
 * edited later, the recomputed hash will not match what was stored.
 */
export function entryHash(entry: ChainableEntry, prevHash: string | null): string {
  return createHash("sha256")
    .update(
      canonical({
        prev: prevHash,
        documentId: entry.documentId,
        actorId: entry.actorId,
        action: entry.action,
        before: entry.before ?? null,
        after: entry.after ?? null,
        timestamp: entry.timestamp.toISOString(),
      }),
    )
    .digest("hex");
}

export interface StoredEntry extends ChainableEntry {
  id: string;
  seq: number;
  hash: string | null;
  prevHash: string | null;
}

export type ChainVerdict =
  | { intact: true; entries: number; head: string | null }
  | {
      intact: false;
      entries: number;
      head: string | null;
      brokenAtSeq: number;
      brokenEntryId: string;
      reason: string;
      /** For the interface's translations. */
      reasonCode: "unhashed" | "unlinked" | "altered";
    };

/**
 * Walk a document's entries in order and confirm every link.
 *
 * Three ways a chain fails, and each is reported distinctly because they mean
 * different things: a rewritten entry (content no longer hashes to what was
 * stored), a removed or reordered entry (a link points at the wrong parent),
 * and an unchained entry (written before this existed, or inserted directly).
 */
export function verifyChain(entries: StoredEntry[]): ChainVerdict {
  const ordered = [...entries].sort((a, b) => a.seq - b.seq);
  let prev: string | null = null;

  for (const entry of ordered) {
    if (entry.hash === null) {
      return {
        intact: false, entries: ordered.length, head: prev,
        brokenAtSeq: entry.seq, brokenEntryId: entry.id,
        reason: "Entry carries no hash — it was written outside the audit API.",
        reasonCode: "unhashed",
      };
    }
    if (entry.prevHash !== prev) {
      return {
        intact: false, entries: ordered.length, head: prev,
        brokenAtSeq: entry.seq, brokenEntryId: entry.id,
        reason:
          "Entry does not link to the one before it — an entry has been removed, reordered or inserted.",
        reasonCode: "unlinked",
      };
    }
    const recomputed = entryHash(entry, prev);
    if (recomputed !== entry.hash) {
      return {
        intact: false, entries: ordered.length, head: prev,
        brokenAtSeq: entry.seq, brokenEntryId: entry.id,
        reason: "Entry content does not match its hash — this entry has been altered since it was written.",
        reasonCode: "altered",
      };
    }
    prev = entry.hash;
  }

  return { intact: true, entries: ordered.length, head: prev };
}
