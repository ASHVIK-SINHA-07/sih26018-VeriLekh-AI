import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { authConfig } from "@/lib/auth.config";

/**
 * Full Auth.js config — docs/03_Security_Access.md.
 *
 * Credentials provider over email + password. Passwords are compared against
 * the bcrypt hash in `User.passwordHash`; plaintext is never stored or logged.
 * The session lives in an httpOnly cookie (Auth.js default), so it is not
 * readable from JavaScript.
 *
 * This module imports Prisma and bcryptjs, so it must never be pulled into
 * middleware — see the note in auth.config.ts.
 */
export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const email =
          typeof credentials?.email === "string"
            ? credentials.email.trim().toLowerCase()
            : "";
        const password =
          typeof credentials?.password === "string" ? credentials.password : "";

        if (!email || !password) return null;

        const user = await db.user.findUnique({ where: { email } });

        // Compare against a dummy hash when the user does not exist, so the
        // response time does not reveal whether an email is registered.
        const hash = user?.passwordHash ?? DUMMY_HASH;
        const passwordMatches = await bcrypt.compare(password, hash);

        if (!user || !passwordMatches) return null;

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
        };
      },
    }),
  ],
});

/**
 * A valid bcrypt hash of a value no one can supply, used only to keep the
 * failure path's timing similar to the success path.
 */
const DUMMY_HASH =
  "$2b$12$C6UzMDM.H6dfI/f/IKcEe.7Kf8jN9pWQmVQ9tKb7QMlBmqR0oJ8Hy";
