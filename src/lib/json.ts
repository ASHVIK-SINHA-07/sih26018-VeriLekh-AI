import type { Prisma } from "@prisma/client";

/**
 * Bridges our typed shapes and Prisma's `Json` column types.
 *
 * Prisma types a Json input as an index-signature object, which a declared
 * interface (or an array of them) does not structurally satisfy — even though
 * both serialise identically. These two helpers keep that cast in one place
 * instead of scattered through the route handlers, so the intent stays legible
 * and the unsafe conversion is auditable.
 */

/** Typed value → Prisma Json input. */
export function toJson<T>(value: T): Prisma.InputJsonValue {
  return value as unknown as Prisma.InputJsonValue;
}

/** Prisma Json column → the shape we know we wrote. */
export function fromJson<T>(value: Prisma.JsonValue | null | undefined, fallback: T): T {
  return (value ?? fallback) as unknown as T;
}
