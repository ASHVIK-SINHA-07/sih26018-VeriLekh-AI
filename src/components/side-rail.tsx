import { signOut } from "@/lib/auth";
import { SideRailNav } from "@/components/side-rail-nav";
import type { Role } from "@/types";

/**
 * The navigation rail.
 *
 * Identity, navigation and sign-out live here so every screen's full width is
 * available for data. Sections are gated by role — but hiding a link is
 * presentation only; the middleware and each API route are what actually
 * enforce access (docs/03_Security_Access.md).
 */


const ROLE_LABELS: Record<Role, string> = {
  ADMIN: "Admin",
  VERIFIER: "Verifier",
  VIEWER: "Viewer",
};

export function SideRail({ name, role }: { name: string; role: Role }) {
  const initials = name
    .split(" ")
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <aside className="flex w-[232px] shrink-0 flex-col bg-rail text-rail-ink">
      <div className="border-b border-white/10 px-5 py-5">
        <p className="font-serif text-[17px] leading-tight">Land record</p>
        <p className="font-serif text-[17px] leading-tight">digitization</p>
        <div className="mt-3 h-[2px] w-8 bg-terracotta" />
        <p className="mt-3 text-[10.5px] font-semibold tracking-[0.09em] text-rail-muted uppercase">
          Revenue department
        </p>
      </div>

      <SideRailNav role={role} />


      <div className="border-t border-white/10 px-5 py-4">
        <div className="flex items-center gap-3">
          <span className="flex size-8 items-center justify-center bg-rail-2 text-[11px] font-semibold tracking-wide">
            {initials}
          </span>
          <span className="min-w-0">
            <span className="block truncate text-[13px] text-white">{name}</span>
            <span className="block text-[10.5px] font-semibold tracking-[0.09em] text-rail-muted uppercase">
              {ROLE_LABELS[role]}
            </span>
          </span>
        </div>
        <form
          action={async () => {
            "use server";
            await signOut({ redirectTo: "/login" });
          }}
        >
          <button
            type="submit"
            className="mt-3 w-full border border-white/15 py-1.5 text-[12px] text-rail-muted transition-colors hover:border-white/35 hover:text-white"
          >
            Log out
          </button>
        </form>
      </div>
    </aside>
  );
}
