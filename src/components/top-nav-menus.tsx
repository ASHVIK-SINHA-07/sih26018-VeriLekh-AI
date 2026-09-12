"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { Bell, ChevronDown, Menu, X } from "lucide-react";
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
        className="flex items-center gap-2 py-1 text-[14.5px] text-white/90 transition-colors hover:text-white"
      >
        <span className="flex size-9 items-center justify-center bg-rail-2 text-[11.5px] font-semibold tracking-wide">
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
          <p className="truncate text-[15px] font-medium">{name}</p>
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
        <div className="fixed inset-x-0 top-16 bottom-0 overflow-y-auto border-t border-white/10 bg-rail">
          {children}
        </div>
      ) : null}
    </div>
  );
}


/* --------------------------------------------------------- notifications */

interface NoticeItem {
  id: string;
  kind: "order" | "flagged";
  filename: string;
  place: string;
  finding: string | null;
  updatedAt: string;
  when: string;
}

/** When this person last opened the list, in this browser. */
const SEEN_KEY = "verilekh.notifications.seen";
/** How often to look again while a page is open. */
const REFRESH_MS = 60_000;

/**
 * What is waiting for you: mutation orders awaiting a decision, and records
 * with problems found. Asked of the server on every page change, every
 * minute, and when the window regains focus. The count on the bell is what
 * has changed since you last opened the list.
 */
export function NotificationBell() {
  const [items, setItems] = useState<NoticeItem[]>([]);
  const [open, setOpen] = useState(false);
  // Infinity until storage is read, so the badge never flashes on load.
  const [seenAt, setSeenAt] = useState(Number.POSITIVE_INFINITY);
  const [newSince, setNewSince] = useState(0);
  const box = useRef<HTMLDivElement>(null);
  const pathname = usePathname();
  const { t, locale } = useI18n();
  useDismiss(open, () => setOpen(false), box);

  useEffect(() => {
    try {
      setSeenAt(Number(window.localStorage.getItem(SEEN_KEY) ?? 0));
    } catch {
      setSeenAt(0);
    }
  }, []);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const response = await fetch("/api/notifications", { cache: "no-store" });
        if (!response.ok) return;
        const body = (await response.json()) as { items: NoticeItem[] };
        if (alive) setItems(body.items);
      } catch {
        /* offline for a moment: keep what is shown */
      }
    };
    void load();
    const timer = window.setInterval(load, REFRESH_MS);
    window.addEventListener("focus", load);
    return () => {
      alive = false;
      window.clearInterval(timer);
      window.removeEventListener("focus", load);
    };
  }, [pathname, locale]);

  const fresh = items.filter((item) => Date.parse(item.updatedAt) > seenAt).length;

  function toggle() {
    if (!open) {
      // Mark what was new before opening, then clear the badge.
      setNewSince(seenAt);
      const now = Date.now();
      setSeenAt(now);
      try {
        window.localStorage.setItem(SEEN_KEY, String(now));
      } catch {
        /* the badge simply returns next visit */
      }
    }
    setOpen(!open);
  }

  const groups = [
    { key: "order", title: t("notify.orders"), rows: items.filter((item) => item.kind === "order") },
    { key: "flagged", title: t("notify.flagged"), rows: items.filter((item) => item.kind === "flagged") },
  ].filter((group) => group.rows.length > 0);

  return (
    <div ref={box} className="relative">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={fresh > 0 ? t("notify.openWithCount", { count: fresh }) : t("notify.open")}
        className="relative flex size-9 items-center justify-center text-white/85 transition-colors hover:text-white"
      >
        <Bell className="size-5" strokeWidth={1.75} />
        {fresh > 0 ? (
          <span className="absolute -top-0.5 -right-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-terracotta px-1 text-[11px] leading-none font-semibold text-white tabular-nums">
            {fresh > 99 ? "99+" : fresh}
          </span>
        ) : null}
      </button>

      {open ? (
        <div
          role="dialog"
          aria-label={t("notify.title")}
          className="absolute top-full right-0 z-50 mt-2 w-[min(24rem,calc(100vw-2rem))] border border-hairline bg-panel text-foreground shadow-[0_8px_24px_rgba(20,24,31,0.14)]"
        >
          <div className="flex items-baseline justify-between gap-3 border-b border-hairline bg-panel-alt px-4 py-2.5">
            <p className="text-[15px] font-semibold">{t("notify.title")}</p>
            {items.length > 0 ? (
              <p className="text-[13px] text-muted-foreground">{t("notify.needYou", { count: items.length })}</p>
            ) : null}
          </div>

          <div className="max-h-[26rem] overflow-y-auto">
            {groups.length === 0 ? (
              <p className="px-4 py-6 text-[14px] text-muted-foreground">{t("notify.none")}</p>
            ) : (
              groups.map((group) => (
                <section key={group.key} className="border-b border-hairline last:border-b-0">
                  <p className="label-cap px-4 pt-3 pb-1">
                    {group.title} · {group.rows.length}
                  </p>
                  <ul>
                    {group.rows.map((item) => (
                      <li key={item.id}>
                        <Link href={`/verify/${item.id}`} className="block px-4 py-2.5 transition-colors hover:bg-panel-alt">
                          <span className="flex items-center gap-2">
                            {Date.parse(item.updatedAt) > newSince ? (
                              <span className="size-2 shrink-0 rounded-full bg-terracotta" aria-label={t("notify.isNew")} />
                            ) : null}
                            <span className="truncate text-[14px] font-medium text-navy">{item.filename}</span>
                          </span>
                          <span className="mt-0.5 block text-[12.5px] text-muted-foreground">
                            {[item.place, item.when].filter(Boolean).join(" · ")}
                          </span>
                          {item.finding ? (
                            <span className="mt-1 line-clamp-2 block text-[13px] leading-snug text-ink-2">{item.finding}</span>
                          ) : null}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </section>
              ))
            )}
          </div>

          <div className="border-t border-hairline px-4 py-2.5">
            <Link href="/verify" className="text-[13.5px] font-medium text-navy hover:underline">
              {t("notify.viewAll")}
            </Link>
          </div>
        </div>
      ) : null}
    </div>
  );
}
