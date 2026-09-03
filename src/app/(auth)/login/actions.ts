"use server";

import { AuthError } from "next-auth";
import { signIn } from "@/lib/auth";

export type LoginState = { error: string | null };

/**
 * Sign-in server action.
 *
 * On success this always redirects to "/", which routes onward by role
 * (see src/app/page.tsx) — that keeps the role-redirect rule from doc 03 in
 * exactly one place instead of duplicating it here.
 *
 * The error message is deliberately identical for "no such email" and "wrong
 * password": telling them apart would let anyone enumerate valid accounts.
 */
export async function login(
  _prevState: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    return { error: "Enter both your email and password" };
  }

  try {
    await signIn("credentials", { email, password, redirectTo: "/" });
  } catch (error) {
    // signIn throws a redirect on success; that must propagate untouched.
    if (error instanceof AuthError) {
      return { error: "Incorrect email or password" };
    }
    throw error;
  }

  return { error: null };
}
