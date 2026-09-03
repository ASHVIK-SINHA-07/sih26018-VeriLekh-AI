import { PrismaClient } from "@prisma/client";

/**
 * Prisma client singleton.
 *
 * Next.js dev mode hot-reloads modules on every edit, which would otherwise
 * open a new connection pool each time until Postgres refuses new clients.
 * Stashing the instance on globalThis keeps exactly one across reloads.
 * In production the module is evaluated once, so the global is not used.
 */
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    log:
      process.env.NODE_ENV === "development"
        ? ["query", "error", "warn"]
        : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = db;
}
