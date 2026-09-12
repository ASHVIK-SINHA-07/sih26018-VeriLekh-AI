"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { ChevronDown, Menu, X } from "lucide-react";
import { useI18n } from "@/i18n/client";
import { TOUR_EVENT } from "@/components/tour";

/**
 * The two pop-outs of the navigation bar: the account menu on a wide screen,
 * and the whole navigation folded behind one button on a phone. Their content
 * is rendered on the server and passed in, so the sign-out form stays a
 * server action.
 */

/** Close on Escape, on a click outside, and whenever the page changes. */
function useDismiss(open: boolean, close: () => void, box: React.RefObject<HTMLElement | null>) {
  const pathname = usePathname();
  useEffect(() => close(), [pathname]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && close();
    const onClick = (event: MouseEvent) => {
      if (box.current && !box.current.contains(event.target as Node)) close();
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousedown", onClick);
    window.addEventListener(TOUR_EVENT, close);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onClick);
      window.removeEventListener(TOUR_EVENT, close);
    };
  }, [open, close, box]);
}

export function AccountMenu({
  name,
  initials,
  roleLabel,
  children,
}: {
  name: string;
  initials: string;
  roleLabel: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const { t } = useI18n();
  useDismiss(open, () => setOpen(false), box);

  return (
    <div ref={box} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={t("nav.account")}
        className="flex items-center gap-2 py-1 text-[13px] text-white/90 transition-colors hover:text-white"
      >
        <span className="flex size-7 items-center justify-center bg-rail-2 text-[10.5px] font-semibold tracking-wide">
          {initials}
        </span>
        <span className="max-w-[10rem] truncate">{name}</span>
        <ChevronDown className="size-3.5 text-rail-muted" />
      </button>

      {open ? (
        <div
          role="menu"
          className="absolute top-full right-0 mt-2 w-60 border border-hairline bg-panel p-3 text-foreground shadow-[0_8px_24px_rgba(20,24,31,0.14)]"
        >
          <p className="truncate text-[13.5px] font-medium">{name}</p>
          <p className="label-cap mt-0.5">{roleLabel}</p>
          <div className="mt-3 border-t border-hairline pt-3">{children}</div>
        </div>
      ) : null}
    </div>
  );
}

export function MobileMenu({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const { t } = useI18n();
  useDismiss(open, () => setOpen(false), box);

  // Don't let the page scroll behind an open menu.
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  return (
    <div ref={box} className="justify-self-end lg:hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label={open ? t("nav.closeNav") : t("nav.openNav")}
        className="p-1 text-white/80 transition-colors hover:text-white"
      >
        {open ? <X className="size-5" /> : <Menu className="size-5" />}
      </button>

      {open ? (
        <div className="fixed inset-x-0 top-14 bottom-0 overflow-y-auto border-t border-white/10 bg-rail">
          {children}
        </div>
      ) : null}
    </div>
  );
}
