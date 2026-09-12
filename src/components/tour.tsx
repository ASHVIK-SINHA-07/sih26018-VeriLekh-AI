"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useI18n } from "@/i18n/client";

/**
 * The guided tour — a few steps per screen, pointing at the real controls.
 *
 * Shown the first time someone opens a screen in this browser, and replayed
 * from "Take the tour" in the account menu. One short tour per screen rather
 * than one long tour across pages: it survives a reload, and a step whose
 * control is not on the page — hidden by role, or an empty queue — is left
 * out rather than pointing at nothing.
 *
 * Seen-state lives in this browser's storage. The build guide planned the
 * database, so the tour would follow a person between computers; that needs a
 * schema change and waits for Round 2.
 */

export type TourScreen = "upload" | "queue" | "review" | "dashboard";

type StepKey =
  | "uploadDrop" | "uploadRecent"
  | "queueFilters" | "queueTable"
  | "reviewBanner" | "reviewScan" | "reviewFields" | "reviewActions" | "reviewQuality"
  | "dashStats" | "dashRisk" | "dashActivity";

interface Step {
  /** The `data-tour` value of the control this step points at. */
  target: string;
  key: StepKey;
}

/** In the order the controls appear on the page. */
const STEPS: Record<TourScreen, Step[]> = {
  upload: [
    { target: "upload-drop", key: "uploadDrop" },
    { target: "upload-recent", key: "uploadRecent" },
  ],
  queue: [
    { target: "queue-filters", key: "queueFilters" },
    { target: "queue-table", key: "queueTable" },
  ],
  review: [
    { target: "review-banner", key: "reviewBanner" },
    { target: "review-scan", key: "reviewScan" },
    { target: "review-fields", key: "reviewFields" },
    { target: "review-actions", key: "reviewActions" },
    { target: "review-quality", key: "reviewQuality" },
  ],
  dashboard: [
    { target: "dash-stats", key: "dashStats" },
    { target: "dash-risk", key: "dashRisk" },
    { target: "dash-activity", key: "dashActivity" },
  ],
};

/** Fired by "Take the tour": the tour for the open screen replays. */
export const TOUR_EVENT = "verilekh:tour";

const storageKey = (screen: TourScreen) => `verilekh.tour.${screen}`;

function alreadySeen(screen: TourScreen): boolean {
  try {
    return window.localStorage.getItem(storageKey(screen)) === "seen";
  } catch {
    return true; // storage blocked: never force the tour on anyone
  }
}

function rememberSeen(screen: TourScreen) {
  try {
    window.localStorage.setItem(storageKey(screen), "seen");
  } catch {
    /* replay from the menu still works */
  }
}

const find = (target: string) => document.querySelector<HTMLElement>(`[data-tour="${target}"]`);

/** Space between the control and the highlight, and between highlight and card. */
const PAD = 6;
const GAP = 12;
const CARD_WIDTH = 320;
/** Room the card needs to sit above or below the control. */
const CARD_ROOM = 220;

export function Tour({ screen }: { screen: TourScreen }) {
  const { t } = useI18n();
  const [steps, setSteps] = useState<Step[]>([]);
  const [index, setIndex] = useState(-1);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const card = useRef<HTMLDivElement>(null);

  const start = useCallback(() => {
    const present = STEPS[screen].filter((step) => find(step.target));
    if (present.length === 0) return;
    setSteps(present);
    setRect(null);
    setIndex(0);
  }, [screen]);

  const finish = useCallback(() => {
    setIndex(-1);
    rememberSeen(screen);
  }, [screen]);

  // First visit: begin once the page has settled.
  useEffect(() => {
    if (alreadySeen(screen)) return;
    const timer = window.setTimeout(start, 700);
    return () => window.clearTimeout(timer);
  }, [screen, start]);

  // "Take the tour" from the menu.
  useEffect(() => {
    window.addEventListener(TOUR_EVENT, start);
    return () => window.removeEventListener(TOUR_EVENT, start);
  }, [start]);

  const step = index >= 0 ? steps[index] : undefined;
  const last = index === steps.length - 1;
  const next = useCallback(() => (last ? finish() : setIndex((i) => i + 1)), [last, finish]);
  const back = useCallback(() => setIndex((i) => Math.max(0, i - 1)), []);

  // Bring the step's control into view and keep the highlight on it.
  useEffect(() => {
    if (!step) return;
    const el = find(step.target);
    if (!el) {
      setIndex((i) => (i + 1 < steps.length ? i + 1 : -1));
      return;
    }
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollIntoView({ block: "center", behavior: reduce ? "auto" : "smooth" });
    const measure = () => setRect(el.getBoundingClientRect());
    measure();
    const settle = window.setTimeout(measure, reduce ? 0 : 450);
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      window.clearTimeout(settle);
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [step, steps]);

  useEffect(() => {
    if (!step) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") finish();
      else if (event.key === "ArrowRight") next();
      else if (event.key === "ArrowLeft") back();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [step, next, back, finish]);

  useEffect(() => {
    if (step) card.current?.focus({ preventScroll: true });
  }, [step]);

  if (!step || !rect) return null;

  const viewW = window.innerWidth;
  const viewH = window.innerHeight;
  const width = Math.min(CARD_WIDTH, viewW - 32);
  const left = Math.min(Math.max(rect.left, 16), viewW - width - 16);
  const placement: React.CSSProperties =
    viewH - rect.bottom >= CARD_ROOM
      ? { top: rect.bottom + PAD + GAP, left, width }
      : rect.top >= CARD_ROOM
        ? { bottom: viewH - rect.top + PAD + GAP, left, width }
        : { bottom: 16, left, width };
  const titleId = `tour-${step.key}`;

  return (
    <div className="fixed inset-0 z-[60]">
      {/* Holds the page still while the tour runs. */}
      <div className="absolute inset-0" aria-hidden="true" />
      <div
        aria-hidden="true"
        className="pointer-events-none fixed border-2 border-terracotta transition-all duration-200 motion-reduce:transition-none"
        style={{
          top: rect.top - PAD,
          left: rect.left - PAD,
          width: rect.width + PAD * 2,
          height: rect.height + PAD * 2,
          boxShadow: "0 0 0 9999px rgba(20, 24, 31, 0.55)",
        }}
      />
      <div
        ref={card}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={`${titleId}-body`}
        tabIndex={-1}
        className="fixed border border-hairline bg-panel p-4 text-foreground shadow-[0_12px_32px_rgba(20,24,31,0.25)] outline-none"
        style={placement}
      >
        <p className="label-cap">{t("tour.progress", { n: index + 1, total: steps.length })}</p>
        <h2 id={titleId} className="mt-1 font-serif text-[17px] text-navy">
          {t(`tour.${step.key}.title`)}
        </h2>
        <p id={`${titleId}-body`} className="mt-1.5 text-[15px] leading-relaxed text-ink-2">
          {t(`tour.${step.key}.body`)}
        </p>
        <div className="mt-4 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={finish}
            className="text-[14px] text-muted-foreground underline-offset-2 hover:text-navy hover:underline"
          >
            {t("tour.skip")}
          </button>
          <div className="flex gap-2">
            {index > 0 ? (
              <button
                type="button"
                onClick={back}
                className="border border-rule px-3 py-1.5 text-[14px] transition-colors hover:border-navy hover:text-navy"
              >
                {t("tour.back")}
              </button>
            ) : null}
            <button
              type="button"
              onClick={next}
              className="bg-navy px-3 py-1.5 text-[14px] font-medium text-white transition-opacity hover:opacity-90"
            >
              {last ? t("tour.done") : t("tour.next")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/** "Take the tour" — replays the tour for whichever screen is open. */
export function TourButton({ tone }: { tone: "paper" | "rail" }) {
  const { t } = useI18n();
  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new Event(TOUR_EVENT))}
      className={
        tone === "paper"
          ? "mb-2 w-full border border-rule px-3 py-1.5 text-[14px] text-ink-2 transition-colors hover:border-navy hover:text-navy"
          : "w-full border border-white/15 py-1.5 text-[13px] text-rail-muted transition-colors hover:border-white/35 hover:text-white"
      }
    >
      {t("tour.replay")}
    </button>
  );
}
