import type { DefaultSession } from "next-auth";
import type { Role } from "@/types";

/**
 * Auth.js module augmentation.
 *
 * Doc 03 requires the session to carry the user's `role` as a claim so the UI
 * and API can gate on it. Declaring it here makes `session.user.role` typed
 * everywhere instead of an `any` cast at each call site.
 */
declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: Role;
    } & DefaultSession["user"];
  }

  interface User {
    role: Role;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    role: Role;
  }
}
