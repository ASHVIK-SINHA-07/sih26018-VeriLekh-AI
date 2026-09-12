import Link from "next/link";
import { signOut } from "@/lib/auth";
import { LanguageSwitcher } from "@/components/language-switcher";
import { Logo } from "@/components/logo";
import { TourButton } from "@/components/tour";
import { TopNavLinks } from "@/components/top-nav-links";
import { AccountMenu, MobileMenu, NotificationBell } from "@/components/top-nav-menus";
import { getI18n } from "@/i18n/server";
import type { Role } from "@/types";

/**
 * The navigation bar — the `AppNav` of docs/04_Frontend_Spec.md: brand on the
 * left, the sections centred, language and account on the right.
 *
 * Sections are gated by role, but hiding a link is presentation only; the
 * middleware and each API route are what actually enforce access
 * (docs/03_Security_Access.md).
 */
export async function TopNav({ name, role }: { name: string; role: Role }) {
  const { t } = await getI18n();
  const initials = name
    .split(" ")
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
  const roleLabel = t(`roles.${role}`);

  async function logout() {
    "use server";
    await signOut({ redirectTo: "/login" });
  }

  return (
    <header className="sticky top-0 z-40 bg-rail text-rail-ink shadow-[0_1px_0_rgba(0,0,0,0.25)]">
      <div className="grid h-16 grid-cols-[1fr_auto] items-center gap-4 px-4 sm:px-7 lg:grid-cols-[1fr_auto_1fr]">
        <Link href="/" className="flex min-w-0 items-center gap-3">
          <Logo tone="onDark" className="h-[34px] w-auto shrink-0" />
          <span className="hidden truncate border-l border-white/15 pl-3 text-[13px] leading-tight text-rail-muted xl:block">
            {t("app.name")}
          </span>
        </Link>

        <TopNavLinks role={role} layout="row" className="hidden lg:flex" />

        <div className="flex items-center justify-end gap-2 lg:gap-4">
          {role === "VIEWER" ? null : <NotificationBell />}
          <div className="hidden items-center gap-4 lg:flex">
          <LanguageSwitcher compact />
          <AccountMenu name={name} initials={initials} roleLabel={roleLabel}>
            <TourButton tone="paper" />
            <form action={logout}>
              <button
                type="submit"
                className="w-full border border-rule px-3 py-1.5 text-[14px] text-ink-2 transition-colors hover:border-navy hover:text-navy"
              >
                {t("nav.logout")}
              </button>
            </form>
          </AccountMenu>
          </div>

        <MobileMenu>
          <TopNavLinks role={role} layout="column" />
          <div className="space-y-3 border-t border-white/10 px-4 py-4">
            <div className="flex items-center gap-3">
              <span className="flex size-8 items-center justify-center bg-rail-2 text-[12px] font-semibold tracking-wide">
                {initials}
              </span>
              <span className="min-w-0">
                <span className="block truncate text-[14.5px] text-white">{name}</span>
                <span className="block text-[11.5px] font-semibold tracking-[0.09em] text-rail-muted uppercase">
                  {roleLabel}
                </span>
              </span>
            </div>
            <LanguageSwitcher />
            <TourButton tone="rail" />
            <form action={logout}>
              <button
                type="submit"
                className="w-full border border-white/15 py-1.5 text-[13px] text-rail-muted transition-colors hover:border-white/35 hover:text-white"
              >
                {t("nav.logout")}
              </button>
            </form>
          </div>
        </MobileMenu>
        </div>
      </div>
    </header>
  );
}
