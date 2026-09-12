"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, ClipboardCheck, Upload } from "lucide-react";
import { useI18n } from "@/i18n/client";
import type { Role } from "@/types";

/**
 * The section links. Client-side only so they can mark the active section
 * from the current path; the rest of the bar stays a server component.
 */
const SECTIONS = [
  { href: "/upload", label: "nav.upload", icon: Upload, roles: ["ADMIN", "VERIFIER"] },
  { href: "/verify", label: "nav.verification", icon: ClipboardCheck, roles: ["ADMIN", "VERIFIER"] },
  { href: "/dashboard", label: "nav.dashboard", icon: BarChart3, roles: ["ADMIN", "VERIFIER", "VIEWER"] },
] as const;

export function TopNavLinks({
  role,
  layout,
  className = "",
}: {
  role: Role;
  /** A row in the bar, or a column in the phone menu. */
  layout: "row" | "column";
  className?: string;
}) {
  const pathname = usePathname();
  const { t } = useI18n();
  const visible = SECTIONS.filter((section) =>
    (section.roles as readonly string[]).includes(role),
  );

  return (
    <nav className={`${layout === "row" ? "h-full items-stretch gap-1" : "flex flex-col px-2 py-3"} ${className}`}>
      {visible.map((section) => {
        const active = pathname === section.href || pathname.startsWith(`${section.href}/`);
        const Icon = section.icon;
        return (
          <Link
            key={section.href}
            href={section.href}
            aria-current={active ? "page" : undefined}
            className={`relative flex items-center gap-2 px-3 text-[13.5px] transition-colors ${
              layout === "row" ? "" : "py-2.5"
            } ${active ? "font-medium text-white" : "text-rail-muted hover:text-white"}`}
          >
            {active ? (
              <span
                className={
                  layout === "row"
                    ? "absolute inset-x-3 bottom-0 h-[3px] bg-terracotta"
                    : "absolute top-0 left-0 h-full w-[3px] bg-terracotta"
                }
              />
            ) : null}
            <Icon className="size-4" strokeWidth={1.75} />
            {t(section.label)}
          </Link>
        );
      })}
    </nav>
  );
}
