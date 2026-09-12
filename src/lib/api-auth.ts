import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { hashToken } from "@/lib/token";
import { allow, type RateWindow } from "@/lib/rate-limit";
import type { Role } from "@/types";

/**
 * Layer 2 of the two enforcement layers in docs/03_Security_Access.md.
 *
 * Middleware protects *pages*; it does not protect API routes (they are
 * excluded from its matcher). So every route handler re-checks the session
 * role server-side before acting. Never trust the client: a Viewer calling a
 * mutating endpoint directly must get a 403 even though the button is hidden
 * in their UI.
 */

export interface Actor {
  id: string;
  email: string;
  name: string;
  role: Role;
}

type Guard =
  | { ok: true; actor: Actor }
  | { ok: false; response: NextResponse };

/** Anyone signed in. Used by the read-only endpoints a Viewer may call. */
export async function requireSession(): Promise<Guard> {
  const session = await auth();

  if (!session?.user?.id) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Not signed in" },
        { status: 401 },
      ),
    };
  }

  return {
    ok: true,
    actor: {
      id: session.user.id,
      email: session.user.email ?? "",
      name: session.user.name ?? "",
      role: session.user.role,
    },
  };
}

/** Signed in *and* holding one of `allowed`. Anything else gets a 403. */
export async function requireRole(allowed: Role[]): Promise<Guard> {
  const guard = await requireSession();
  if (!guard.ok) return guard;

  if (!allowed.includes(guard.actor.role)) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Your role does not permit this action" },
        { status: 403 },
      ),
    };
  }

  return guard;
}

/** Said on every /api/v1 response: the data behind this prototype is invented. */
export const API_NOTICE = "Synthetic demonstration data — not an official government record.";

/** Per key: plenty for a system syncing records, not enough to scrape at speed. */
const KEY_LIMIT = 120;
const KEY_WINDOW_MS = 60_000;
const keyWindows = new Map<string, RateWindow>();

/**
 * For the read-only integration API (/api/v1): an API key another
 * government system holds, sent as a bearer token — or a signed-in person, so
 * the reference page's examples can be tried from a browser. A key reads; it
 * can never write, because nothing under /api/v1 does.
 */
export async function requireReader(request: Request): Promise<Guard> {
  const bearer = (request.headers.get("authorization") ?? "").match(/^Bearer\s+(\S+)$/i);
  if (!bearer) return requireSession();

  const key = await db.apiToken.findUnique({ where: { tokenHash: hashToken(bearer[1]) } });
  if (!key || key.revokedAt) {
    return { ok: false, response: NextResponse.json({ error: "Unknown or revoked API key" }, { status: 401 }) };
  }
  if (!allow(keyWindows, key.id, KEY_LIMIT, KEY_WINDOW_MS)) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Too many requests — 120 a minute per key" }, { status: 429 }),
    };
  }
  // When it was last used is what tells an admin a key is live or forgotten.
  void db.apiToken.update({ where: { id: key.id }, data: { lastUsedAt: new Date() } }).catch(() => {});
  return { ok: true, actor: { id: key.id, email: "", name: key.name, role: "VIEWER" } };
}

/** Roles that may upload, extract, edit, approve and reject — doc 03 matrix. */
export const CAN_WRITE: Role[] = ["ADMIN", "VERIFIER"];
