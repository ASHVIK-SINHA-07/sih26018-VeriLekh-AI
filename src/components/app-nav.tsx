import Link from "next/link";
import { signOut } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import type { Role } from "@/types";

/**
 * AppNav — docs/04_Frontend_Spec.md shared components.
 * Top nav, sections gated by role, plus logout.
 *
 * Hiding a link is presentation only. The real gate is the middleware plus the
 * server-side role check in each API route (doc 03) — a Viewer who types
 * /upload directly is still turned away.
 */

const SECTIONS: { href: string; label: string; roles: Role[] }[] = [
  { href: "/upload", label: "Upload", roles: ["ADMIN", "VERIFIER"] },
  { href: "/verify", label: "Verification", roles: ["ADMIN", "VERIFIER"] },
  { href: "/dashboard", label: "Dashboard", roles: ["ADMIN", "VERIFIER", "VIEWER"] },
];

const ROLE_LABELS: Record<Role, string> = {
  ADMIN: "Admin",
  VERIFIER: "Verifier",
  VIEWER: "Viewer",
};

export function AppNav({ name, role }: { name: string; role: Role }) {
  const visible = SECTIONS.filter((section) => section.roles.includes(role));

  return (
    <header className="bg-navy text-white">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-6 py-3">
        <span className="font-medium">Land record digitization</span>

        <nav className="flex items-center gap-4 text-sm">
          {visible.map((section) => (
            <Link
              key={section.href}
              href={section.href}
              className="text-white/80 transition-colors hover:text-white"
            >
              {section.label}
            </Link>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-3 text-sm">
          <span className="text-white/70">
            {name} · {ROLE_LABELS[role]}
          </span>
          <form
            action={async () => {
              "use server";
              await signOut({ redirectTo: "/login" });
            }}
          >
            <Button
              type="submit"
              variant="ghost"
              size="sm"
              className="text-white hover:bg-white/10 hover:text-white"
            >
              Log out
            </Button>
          </form>
        </div>
      </div>
    </header>
  );
}
