import { strict as assert } from "node:assert";
import { test } from "node:test";
import { hashToken, newToken, TOKEN_PREFIX } from "@/lib/token";

/** API keys: what is stored must never be enough to use one. */

test("a key has the expected shape, and its visible prefix is its start", () => {
  const { token, prefix } = newToken();
  assert.match(token, /^vlk_[0-9a-f]{40}$/);
  assert.ok(token.startsWith(prefix));
  assert.ok(prefix.startsWith(TOKEN_PREFIX));
  assert.ok(prefix.length < token.length);
});

test("only a hash is stored, and it is not the key", () => {
  const { token, hash } = newToken();
  assert.equal(hash, hashToken(token));
  assert.notEqual(hash, token);
  assert.ok(!hash.includes(token.slice(4)));
});

test("two keys are never the same", () => {
  assert.notEqual(newToken().token, newToken().token);
});
