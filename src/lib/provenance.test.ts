import { strict as assert } from "node:assert";
import { test } from "node:test";
import { entryHash, verifyChain, type StoredEntry } from "@/lib/provenance";

/**
 * The whole value of the chain is that tampering is *detected*. These tests
 * are the tampering — each one alters the log the way someone covering their
 * tracks would, and asserts the chain notices.
 */

const AT = (s: number) => new Date(Date.UTC(2026, 8, 10, 12, 0, s));

function build(n: number): StoredEntry[] {
  const out: StoredEntry[] = [];
  let prev: string | null = null;
  for (let i = 0; i < n; i++) {
    const base = {
      documentId: "doc1", actorId: "user1",
      action: i === 0 ? "UPLOAD" : "EDIT_FIELD",
      before: { value: `old${i}` }, after: { value: `new${i}` },
      timestamp: AT(i),
    };
    const hash = entryHash(base, prev);
    out.push({ ...base, id: `e${i}`, seq: i, hash, prevHash: prev });
    prev = hash;
  }
  return out;
}

test("an untouched chain verifies", () => {
  const v = verifyChain(build(5));
  assert.equal(v.intact, true);
  assert.equal(v.entries, 5);
});

test("hashing is deterministic and order-independent for object keys", () => {
  const t = AT(1);
  const a = entryHash({ documentId: "d", actorId: "u", action: "APPROVE",
    before: { x: 1, y: 2 }, after: null, timestamp: t }, null);
  const b = entryHash({ documentId: "d", actorId: "u", action: "APPROVE",
    before: { y: 2, x: 1 }, after: null, timestamp: t }, null);
  assert.equal(a, b);
});

test("editing an entry's content is caught", () => {
  const chain = build(5);
  chain[2].after = { value: "quietly changed" };
  const v = verifyChain(chain);
  assert.equal(v.intact, false);
  if (v.intact) return;
  assert.equal(v.brokenAtSeq, 2);
  assert.match(v.reason, /altered/);
});

test("changing who did it is caught", () => {
  const chain = build(4);
  chain[3].actorId = "someone-else";
  const v = verifyChain(chain);
  assert.equal(v.intact, false);
  if (v.intact) return;
  assert.equal(v.brokenAtSeq, 3);
});

test("backdating an entry is caught", () => {
  const chain = build(4);
  chain[1].timestamp = new Date(Date.UTC(2020, 0, 1));
  assert.equal(verifyChain(chain).intact, false);
});

test("deleting an entry from the middle is caught", () => {
  const chain = build(5);
  chain.splice(2, 1);
  const v = verifyChain(chain);
  assert.equal(v.intact, false);
  if (v.intact) return;
  assert.match(v.reason, /removed, reordered or inserted/);
});

test("an entry inserted directly into the database is caught", () => {
  const chain = build(3);
  chain.push({
    id: "forged", seq: 3, documentId: "doc1", actorId: "user1",
    action: "APPROVE", before: null, after: { status: "VERIFIED" },
    timestamp: AT(9), hash: "0".repeat(64), prevHash: chain[2].hash,
  });
  assert.equal(verifyChain(chain).intact, false);
});

test("an entry with no hash at all is caught", () => {
  const chain = build(3);
  chain[1].hash = null;
  const v = verifyChain(chain);
  assert.equal(v.intact, false);
  if (v.intact) return;
  assert.match(v.reason, /outside the audit API/);
});

test("entries are verified in sequence order, not array order", () => {
  const chain = build(4).reverse();
  assert.equal(verifyChain(chain).intact, true);
});

test("an empty trail is trivially intact", () => {
  const v = verifyChain([]);
  assert.equal(v.intact, true);
  assert.equal(v.entries, 0);
});
