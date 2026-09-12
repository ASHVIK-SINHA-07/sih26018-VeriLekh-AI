import { strict as assert } from "node:assert";
import { test } from "node:test";
import { allow, type RateWindow } from "@/lib/rate-limit";

/**
 * The limit on the public record check. Too loose and references can be tried
 * at speed; too tight and a citizen checking two documents is turned away.
 */

test("allows up to the limit, then refuses", () => {
  const store = new Map<string, RateWindow>();
  for (let i = 0; i < 3; i++) assert.equal(allow(store, "a", 3, 1000, 0), true);
  assert.equal(allow(store, "a", 3, 1000, 10), false);
});

test("a new window starts once the old one has passed", () => {
  const store = new Map<string, RateWindow>();
  for (let i = 0; i < 3; i++) allow(store, "a", 3, 1000, 0);
  assert.equal(allow(store, "a", 3, 1000, 999), false);
  assert.equal(allow(store, "a", 3, 1000, 1000), true);
});

test("one connection's checks do not use up another's", () => {
  const store = new Map<string, RateWindow>();
  for (let i = 0; i < 3; i++) allow(store, "a", 3, 1000, 0);
  assert.equal(allow(store, "b", 3, 1000, 0), true);
});
