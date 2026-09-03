import NextAuth from "next-auth";
import { authConfig } from "@/lib/auth.config";

/**
 * Layer 1 of the two enforcement layers in docs/03_Security_Access.md:
 * unauthenticated users hitting anything under the `(app)` group are
 * redirected to /login.
 *
 * This imports `auth.config.ts`, not `auth.ts` — the middleware runs on the
 * Edge runtime and must not pull in Prisma or bcryptjs.
 *
 * Layer 2 (the server-side role re-check in every mutating API route) is not
 * optional: middleware alone would leave a direct API call unguarded.
 */
export default NextAuth(authConfig).auth;

export const config = {
  // Skip API routes, Next internals and static files; guard everything else.
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
