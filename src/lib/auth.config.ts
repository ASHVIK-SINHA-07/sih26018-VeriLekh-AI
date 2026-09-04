import type { NextAuthConfig } from "next-auth";
import type { Role } from "@/types";

/**
 * Edge-safe half of the Auth.js config.
 *
 * `middleware.ts` runs on the Edge runtime, which cannot load Prisma or
 * bcryptjs. So the route-protection rules and the token/session callbacks live
 * here (no Node-only imports), and the Credentials provider — which needs both
 * the database and bcrypt — lives in `auth.ts`, which imports this file.
 *
 * Route protection is layer 1 of the two required by docs/03_Security_Access.md.
 * Layer 2 is the server-side role re-check inside each mutating API route:
 * never trust the client, and never rely on middleware alone.
 */

/** Routes under the `(app)` group. Route groups are not part of the URL. */
const SIGNED_IN_ONLY = ["/upload", "/verify", "/dashboard"];

/** Doc 03 permission matrix: a Viewer has dashboard access only. */
const VERIFIER_OR_ADMIN_ONLY = ["/upload", "/verify"];

function matches(pathname: string, routes: string[]): boolean {
  return routes.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`),
  );
}

/** Where a user lands after logging in — doc 03. */
export function landingPageFor(role: Role): string {
  return role === "VIEWER" ? "/dashboard" : "/upload";
}

export const authConfig = {
  /**
   * Trust the Host header.
   *
   * Auth.js auto-trusts it in development but refuses in production unless
   * told to, which otherwise makes every sign-in fail with UntrustedHost the
   * moment the app is built and started for real.
   *
   * Safe here because this is self-hosted on infrastructure the revenue
   * department controls, reached over a known host — the same premise as the
   * data-sovereignty position in docs/03_Security_Access.md. Behind an
   * untrusted proxy this should instead be a pinned AUTH_URL.
   */
  trustHost: true,

  pages: {
    signIn: "/login",
  },
  // Credentials provider requires JWT sessions — there is no DB session row.
  session: { strategy: "jwt" },
  callbacks: {
    authorized({ auth, request: { nextUrl } }) {
      const role = auth?.user?.role;
      const isSignedIn = Boolean(role);
      const { pathname } = nextUrl;

      if (matches(pathname, SIGNED_IN_ONLY)) {
        if (!isSignedIn) return false; // → redirected to /login
        // A Viewer reaching for upload/verify gets sent to their own landing
        // page rather than a dead end.
        if (role === "VIEWER" && matches(pathname, VERIFIER_OR_ADMIN_ONLY)) {
          return Response.redirect(new URL("/dashboard", nextUrl));
        }
        return true;
      }

      // An already-signed-in user has no reason to see the login form again.
      if (pathname === "/login" && isSignedIn) {
        return Response.redirect(new URL(landingPageFor(role as Role), nextUrl));
      }

      return true;
    },

    jwt({ token, user }) {
      // `user` is only present on the sign-in call; afterwards the claim is
      // already on the token.
      if (user) {
        token.role = user.role;
      }
      return token;
    },

    session({ session, token }) {
      session.user.id = token.sub ?? "";
      // The jwt callback above is the only writer of token.role, so this is
      // always a Role. NextAuthConfig's callback signature widens `token`
      // past JWT, which loses that, so narrow it back here.
      session.user.role = token.role as Role;
      return session;
    },
  },
  // Filled in by auth.ts — kept empty here so this file stays edge-safe.
  providers: [],
} satisfies NextAuthConfig;
