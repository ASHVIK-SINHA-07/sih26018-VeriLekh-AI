import { createHash, randomBytes } from "node:crypto";

/**
 * API keys for other government systems.
 *
 * A key is `vlk_` plus 40 hex characters — 160 bits of randomness. Only its
 * SHA-256 is stored, so a copy of the database does not give anyone a
 * working key; the key itself is shown to the admin once, when it is made.
 */

export const TOKEN_PREFIX = "vlk_";

/** Characters kept in the clear, so an admin can tell keys apart. */
const VISIBLE = 12;

export function hashToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function newToken(): { token: string; prefix: string; hash: string } {
  const token = TOKEN_PREFIX + randomBytes(20).toString("hex");
  return { token, prefix: token.slice(0, VISIBLE), hash: hashToken(token) };
}
