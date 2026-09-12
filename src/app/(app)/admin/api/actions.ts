"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { newToken } from "@/lib/token";

/**
 * Creating and revoking API keys. Admins only — checked here, not just by
 * hiding the page, because a server action can be called directly.
 */

export interface CreateTokenState {
  /** The new key, shown once. */
  token: string | null;
  error: "name" | "role" | null;
}

async function currentAdmin() {
  const session = await auth();
  return session?.user?.role === "ADMIN" ? session.user : null;
}

export async function createApiToken(_prev: CreateTokenState, formData: FormData): Promise<CreateTokenState> {
  const admin = await currentAdmin();
  if (!admin) return { token: null, error: "role" };

  const name = String(formData.get("name") ?? "").trim().slice(0, 80);
  if (!name) return { token: null, error: "name" };

  const { token, prefix, hash } = newToken();
  await db.apiToken.create({ data: { name, prefix, tokenHash: hash, createdById: admin.id } });
  revalidatePath("/admin/api");
  return { token, error: null };
}

export async function revokeApiToken(formData: FormData): Promise<void> {
  if (!(await currentAdmin())) return;
  const id = String(formData.get("id") ?? "");
  // updateMany, so revoking an already-revoked key is a no-op, not an error.
  await db.apiToken.updateMany({ where: { id, revokedAt: null }, data: { revokedAt: new Date() } });
  revalidatePath("/admin/api");
}
