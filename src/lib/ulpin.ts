import { randomBytes } from "node:crypto";

/**
 * ULPIN-style identifier generator — docs/01_PRD.md F7.
 *
 * Format: a two-letter state code followed by 12 uppercase hex characters,
 * 14 characters in total (e.g. UP62B4F19C83A7). This matches the length of a
 * real DILRMP ULPIN and the shape already carried by the seeded records
 * (CLAUDE.md D15) — changing it would orphan those.
 *
 * A production ULPIN is derived from the parcel's geo-coordinates, so the same
 * physical plot always yields the same identifier. We have no cadastral
 * geometry, so this issues a random identifier instead and leans on the
 * validation engine to catch duplicate parcels before one is minted. Stated
 * plainly rather than dressed up: this is ULPIN-*style*, not a real ULPIN.
 */

export const ULPIN_LENGTH = 14;

/**
 * State code. Every record in this deployment is Uttar Pradesh; a multi-state
 * rollout would map district → state code here rather than hardcoding.
 */
export const ULPIN_STATE_CODE = "UP";

const RANDOM_LENGTH = ULPIN_LENGTH - ULPIN_STATE_CODE.length; // 12
const ULPIN_PATTERN = new RegExp(
  `^${ULPIN_STATE_CODE}[0-9A-F]{${RANDOM_LENGTH}}$`,
);

/** Issues a new ULPIN-style identifier. */
export function generateUlpin(): string {
  const random = randomBytes(RANDOM_LENGTH)
    .toString("hex")
    .toUpperCase()
    .slice(0, RANDOM_LENGTH);

  return `${ULPIN_STATE_CODE}${random}`;
}

/** True if `value` has the shape this system issues. */
export function isValidUlpin(value: string | null | undefined): boolean {
  return typeof value === "string" && ULPIN_PATTERN.test(value);
}
