"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, ClipboardCheck, Upload } from "lucide-react";
import type { Role } from "@/types";

/**
 * The rail's link list. Client-side only so it can mark the active section
 * from the current path; the rest of the rail stays a server component.
 */
const SECTIONS = [
  { href: "/upload", label: "Upload", icon: Upload, roles: ["ADMIN", "VERIFIER"] },
  { href: "/verify", label: "Verification", icon: ClipboardCheck, roles: ["ADMIN", "VERIFIER"] },
  { href: "/dashboard", label: "Dashboard", icon: BarChart3, roles: ["ADMIN", "VERIFIER", "VIEWER"] },
] as const;

export function SideRailNav({ role }: { role: Role }) {
  const pathname = usePathname();
  const visible = SECTIONS.filter((section) =>
    (section.roles as readonly string[]).includes(role),
  );

  return (
    <nav className="flex-1 px-2 py-4">
      {visible.map((section) => {
        const active =
          pathname === section.href || pathname.startsWith(`${section.href}/`);
        const Icon = section.icon;
        return (
          <Link
            key={section.href}
            href={section.href}
            aria-current={active ? "page" : undefined}
            className={`relative flex items-center gap-3 px-3 py-2.5 text-[13.5px] transition-colors ${
              active
                ? "bg-rail-2 font-medium text-white"
                : "text-rail-muted hover:bg-rail-2/50 hover:text-white"
            }`}
          >
            {active ? (
              <span className="absolute top-0 left-0 h-full w-[3px] bg-terracotta" />
            ) : null}
            <Icon className="size-4" strokeWidth={1.75} />
            {section.label}
          </Link>
        );
      })}
    </nav>
  );
}
