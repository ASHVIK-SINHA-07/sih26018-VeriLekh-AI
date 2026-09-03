import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
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

/** Roles that may upload, extract, edit, approve and reject — doc 03 matrix. */
export const CAN_WRITE: Role[] = ["ADMIN", "VERIFIER"];
