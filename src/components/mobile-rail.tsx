"use client";

import { useEffect, useState } from "react";
import { Menu, X } from "lucide-react";

/**
 * The navigation rail on a small screen.
 *
 * Below `lg` the rail would eat almost half a phone's width, so it slides in
 * over the content instead and is opened from a compact header bar. The rail
 * markup itself is unchanged — it is passed in and simply re-parented.
 */
export function MobileRail({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);

  // A drawer that survives navigation is a trap on a phone.
  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    window.addEventListener("hashchange", close);
    return () => window.removeEventListener("hashchange", close);
  }, [open]);

  // Don't let the page scroll behind an open drawer.
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  return (
    <>
      {/* compact bar, small screens only */}
      <div className="flex items-center gap-3 border-b border-hairline bg-rail px-4 py-3 lg:hidden">
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Open navigation"
          aria-expanded={open}
          className="p-1 text-white/80 transition-colors hover:text-white"
        >
          <Menu className="size-5" />
        </button>
        <span className="font-serif text-[15px] text-white">
          Land record digitization
        </span>
      </div>

      {open ? (
        <div className="fixed inset-0 z-50 flex lg:hidden">
          <button
            type="button"
            aria-label="Close navigation"
            onClick={() => setOpen(false)}
            className="absolute inset-0 bg-black/50"
          />
          <div className="relative flex" onClick={() => setOpen(false)}>
            {children}
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close navigation"
              className="absolute top-3 right-3 p-1 text-white/70 transition-colors hover:text-white"
            >
              <X className="size-5" />
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}
