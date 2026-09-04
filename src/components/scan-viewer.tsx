"use client";

import { useCallback, useRef, useState } from "react";
import { Maximize2, Minus, Plus } from "lucide-react";

/**
 * The scanned record, zoomable and pannable.
 *
 * A verifier has to read faded Devanagari handwriting against the field on the
 * right; at fit-to-width that is often not possible. Scroll or use the
 * controls to zoom, then drag to move around the page.
 *
 * PDFs are handed to the browser's own viewer, which already does this.
 */
const MIN = 1;
const MAX = 6;
const STEP = 0.5;

export function ScanViewer({
  src,
  filename,
  isPdf,
}: {
  src: string;
  filename: string;
  isPdf: boolean;
}) {
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const dragging = useRef<{ x: number; y: number } | null>(null);

  const clamp = (value: number) => Math.min(MAX, Math.max(MIN, value));

  const reset = useCallback(() => {
    setZoom(1);
    setOffset({ x: 0, y: 0 });
  }, []);

  const changeZoom = useCallback((next: number) => {
    const level = clamp(next);
    setZoom(level);
    if (level === 1) setOffset({ x: 0, y: 0 });
  }, []);

  if (isPdf) {
    return (
      <object
        data={src}
        type="application/pdf"
        className="h-[34rem] w-full bg-panel-alt"
        aria-label={`Scan of ${filename}`}
      >
        <p className="p-4 text-[13px] text-muted-foreground">
          This PDF cannot be shown inline.{" "}
          <a href={src} className="text-navy underline">Open it directly</a>.
        </p>
      </object>
    );
  }

  return (
    <div className="relative">
      <div
        className="h-[34rem] overflow-hidden bg-panel-alt"
        style={{ cursor: zoom > 1 ? (dragging.current ? "grabbing" : "grab") : "zoom-in" }}
        onWheel={(event) => {
          if (event.deltaY === 0) return;
          changeZoom(zoom + (event.deltaY < 0 ? STEP : -STEP));
        }}
        onDoubleClick={reset}
        onClick={() => {
          if (zoom === 1) changeZoom(2);
        }}
        onPointerDown={(event) => {
          if (zoom === 1) return;
          dragging.current = { x: event.clientX - offset.x, y: event.clientY - offset.y };
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={(event) => {
          if (!dragging.current) return;
          setOffset({
            x: event.clientX - dragging.current.x,
            y: event.clientY - dragging.current.y,
          });
        }}
        onPointerUp={(event) => {
          dragging.current = null;
          event.currentTarget.releasePointerCapture(event.pointerId);
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt={`Scan of ${filename}`}
          draggable={false}
          className="h-full w-full origin-center object-contain transition-transform duration-100 select-none"
          style={{
            transform: `translate(${offset.x}px, ${offset.y}px) scale(${zoom})`,
          }}
        />
      </div>

      <div className="absolute right-3 bottom-3 flex items-center border border-rule bg-panel">
        <button
          type="button"
          onClick={() => changeZoom(zoom - STEP)}
          disabled={zoom <= MIN}
          aria-label="Zoom out"
          className="px-2 py-1.5 text-ink-2 transition-colors hover:bg-panel-alt disabled:opacity-35"
        >
          <Minus className="size-3.5" />
        </button>
        <span className="min-w-[3.25rem] border-x border-rule px-2 py-1.5 text-center text-[12px] tabular-nums">
          {Math.round(zoom * 100)}%
        </span>
        <button
          type="button"
          onClick={() => changeZoom(zoom + STEP)}
          disabled={zoom >= MAX}
          aria-label="Zoom in"
          className="px-2 py-1.5 text-ink-2 transition-colors hover:bg-panel-alt disabled:opacity-35"
        >
          <Plus className="size-3.5" />
        </button>
        <button
          type="button"
          onClick={reset}
          aria-label="Fit to width"
          className="border-l border-rule px-2 py-1.5 text-ink-2 transition-colors hover:bg-panel-alt"
        >
          <Maximize2 className="size-3.5" />
        </button>
      </div>
    </div>
  );
}
