"use client";

import { useCallback, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/status-badge";
import { EmptyState } from "@/components/empty-state";
import { asRelativeTime } from "@/lib/format";
import {
  ACCEPTED_UPLOAD_TYPES,
  MAX_UPLOAD_BYTES,
  REVIEWABLE_STATUSES,
  type DocumentListItem,
  type DocumentStatus,
} from "@/types";

/**
 * Drop zone plus recent uploads — docs/04_Frontend_Spec.md screen 2.
 *
 * Each file goes through two calls: POST /api/documents to store it, then
 * POST /api/documents/[id]/extract to run the pipeline. Files are processed one
 * at a time rather than in parallel — a batch of twenty firing at once would
 * queue twenty OCR calls and make per-file progress meaningless.
 */

type Stage = "uploading" | "extracting" | "done" | "error";

interface QueueItem {
  key: string;
  filename: string;
  stage: Stage;
  documentId?: string;
  status?: DocumentStatus;
  message?: string;
}

const ACCEPT_ATTR = ACCEPTED_UPLOAD_TYPES.join(",");
const MAX_MB = Math.round(MAX_UPLOAD_BYTES / 1024 / 1024);

const STAGE_LABEL: Record<Stage, string> = {
  uploading: "Uploading…",
  extracting: "Reading the scan…",
  done: "",
  error: "",
};

export function UploadClient({ recent }: { recent: DocumentListItem[] }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [busy, setBusy] = useState(false);

  const update = useCallback((key: string, patch: Partial<QueueItem>) => {
    setQueue((items) =>
      items.map((item) => (item.key === key ? { ...item, ...patch } : item)),
    );
  }, []);

  const processFile = useCallback(
    async (file: File, key: string) => {
      // Check the obvious problems here so the user hears about them
      // immediately; the API re-checks both regardless.
      if (!ACCEPTED_UPLOAD_TYPES.includes(file.type as (typeof ACCEPTED_UPLOAD_TYPES)[number])) {
        update(key, { stage: "error", message: "Not a JPG, PNG or PDF" });
        return;
      }
      if (file.size > MAX_UPLOAD_BYTES) {
        update(key, { stage: "error", message: `Larger than ${MAX_MB} MB` });
        return;
      }

      try {
        const form = new FormData();
        form.append("file", file);

        const uploadResponse = await fetch("/api/documents", {
          method: "POST",
          body: form,
        });
        if (!uploadResponse.ok) {
          const body = await uploadResponse.json().catch(() => ({}));
          update(key, { stage: "error", message: body.error ?? "Upload failed" });
          return;
        }

        const { documentId } = await uploadResponse.json();
        update(key, { stage: "extracting", documentId });

        const extractResponse = await fetch(
          `/api/documents/${documentId}/extract`,
          { method: "POST" },
        );
        if (!extractResponse.ok) {
          const body = await extractResponse.json().catch(() => ({}));
          update(key, {
            stage: "error",
            documentId,
            message: body.error ?? "Could not read this scan",
          });
          return;
        }

        const { status } = await extractResponse.json();
        update(key, { stage: "done", documentId, status });
      } catch {
        update(key, { stage: "error", message: "Network error — is the server running?" });
      }
    },
    [update],
  );

  const handleFiles = useCallback(
    async (files: FileList | null) => {
      if (!files || files.length === 0) return;

      const items: QueueItem[] = Array.from(files).map((file, index) => ({
        key: `${Date.now()}-${index}-${file.name}`,
        filename: file.name,
        stage: "uploading",
      }));

      setQueue((existing) => [...items, ...existing]);
      setBusy(true);

      const list = Array.from(files);
      for (let i = 0; i < list.length; i += 1) {
        await processFile(list[i], items[i].key);
      }

      setBusy(false);
      // Pull the server-rendered recent list back in sync.
      router.refresh();
    },
    [processFile, router],
  );

  return (
    <div className="space-y-8">
      {/* ------------------------------------------------------- drop zone */}
      <div
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          void handleFiles(event.dataTransfer.files);
        }}
        className={`rounded-lg border-2 border-dashed px-6 py-12 text-center transition-colors ${
          dragging
            ? "border-terracotta bg-terracotta/5"
            : "border-border bg-white"
        }`}
      >
        <p className="text-sm font-medium text-foreground">
          Drag scanned records here
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          or browse for files on your computer
        </p>

        <Button
          type="button"
          variant="outline"
          className="mt-4"
          disabled={busy}
          onClick={() => inputRef.current?.click()}
        >
          {busy ? "Working…" : "Browse files"}
        </Button>

        <p className="mt-4 text-xs text-muted-foreground">
          JPG, PNG or PDF · up to {MAX_MB} MB each · several at once is fine
        </p>

        <input
          ref={inputRef}
          type="file"
          multiple
          accept={ACCEPT_ATTR}
          className="hidden"
          onChange={(event) => {
            void handleFiles(event.target.files);
            event.target.value = "";
          }}
        />
      </div>

      {/* --------------------------------------------------- in-flight queue */}
      {queue.length > 0 ? (
        <section className="space-y-3">
          <h2 className="text-sm font-medium text-navy">This batch</h2>
          <ul className="divide-y divide-border rounded-lg border border-border bg-white">
            {queue.map((item) => (
              <li
                key={item.key}
                className="flex flex-wrap items-center gap-3 px-4 py-3"
              >
                <span className="min-w-0 flex-1 truncate text-sm">
                  {item.filename}
                </span>

                {item.stage === "done" && item.status ? (
                  <StatusBadge status={item.status} />
                ) : item.stage === "error" ? (
                  <span className="text-sm text-status-flagged">
                    {item.message}
                  </span>
                ) : (
                  <span className="text-sm text-muted-foreground">
                    {STAGE_LABEL[item.stage]}
                  </span>
                )}

                {item.documentId && item.stage === "done" ? (
                  <Link
                    href={`/verify/${item.documentId}`}
                    className="text-sm text-navy underline underline-offset-2"
                  >
                    Review
                  </Link>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {/* ------------------------------------------------- recent uploads */}
      <section className="space-y-3">
        <h2 className="text-sm font-medium text-navy">Recent uploads</h2>

        {recent.length === 0 ? (
          <EmptyState
            title="No documents yet"
            hint="Upload a scanned record to begin."
          />
        ) : (
          <ul className="divide-y divide-border rounded-lg border border-border bg-white">
            {recent.map((document) => {
              const reviewable = REVIEWABLE_STATUSES.includes(document.status);
              return (
                <li
                  key={document.id}
                  className="flex flex-wrap items-center gap-3 px-4 py-3"
                >
                  <span className="min-w-0 flex-1 truncate text-sm">
                    {document.filename}
                  </span>
                  {document.district ? (
                    <span className="text-sm text-muted-foreground">
                      {document.district}
                    </span>
                  ) : null}
                  <StatusBadge status={document.status} />
                  <span className="w-24 text-right text-xs text-muted-foreground">
                    {asRelativeTime(document.updatedAt)}
                  </span>
                  {reviewable ? (
                    <Link
                      href={`/verify/${document.id}`}
                      className="text-sm text-navy underline underline-offset-2"
                    >
                      Review
                    </Link>
                  ) : (
                    <span className="w-12" aria-hidden />
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
