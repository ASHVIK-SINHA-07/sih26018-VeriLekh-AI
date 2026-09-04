"use client";

import { useCallback, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/status-badge";
import { EmptyState } from "@/components/empty-state";
import { Panel } from "@/components/panel";
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
        className={`border-2 border-dashed px-6 py-10 text-center transition-colors ${
          dragging
            ? "border-terracotta bg-terracotta/[0.06]"
            : "border-rule bg-panel"
        }`}
      >
        <p className="text-[15px] font-semibold text-navy">Drag scanned records here</p>
        <p className="mt-1 text-[13px] text-muted-foreground">
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

        <p className="label-cap mt-4">
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
          <Panel title="This batch" meta={`${queue.length} file${queue.length === 1 ? "" : "s"}`}>
          <ul className="divide-y divide-hairline">
            {queue.map((item) => (
              <li
                key={item.key}
                className="grid grid-cols-[1fr_18.5rem_4.5rem] items-center gap-3 px-4 py-2.5 text-[13px]"
              >
                <span className="min-w-0 truncate font-medium">{item.filename}</span>

                <span>
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
                </span>

                <span className="text-right">
                  {item.documentId && item.stage === "done" ? (
                    <Link
                      href={`/verify/${item.documentId}`}
                      className="text-[12.5px] font-medium text-navy hover:underline"
                    >
                      Review
                    </Link>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
          </Panel>
        </section>
      ) : null}

      {/* ------------------------------------------------- recent uploads */}
      <section className="space-y-3">
        <Panel title="Recent uploads" meta={`${recent.length} most recent`}>
        {recent.length === 0 ? (
          <div className="p-6">
            <EmptyState title="No documents yet" hint="Upload a scanned record to begin." />
          </div>
        ) : (
          <ul className="divide-y divide-hairline">
            {recent.map((document) => {
              const reviewable = REVIEWABLE_STATUSES.includes(document.status);
              return (
                <li
                  key={document.id}
                  className="grid grid-cols-[1fr_9rem_10.5rem_7rem_4.5rem] items-center gap-3 px-4 py-2.5 text-[13px] transition-colors hover:bg-panel-alt/70"
                >
                  <span className="min-w-0 truncate font-medium">
                    {document.filename}
                  </span>
                  <span className="truncate text-ink-2">
                    {document.district ?? ""}
                  </span>
                  <span>
                    <StatusBadge status={document.status} />
                  </span>
                  <span className="text-right text-[12px] text-muted-foreground tabular-nums">
                    {asRelativeTime(document.updatedAt)}
                  </span>
                  <span className="text-right">
                    {reviewable ? (
                      <Link
                        href={`/verify/${document.id}`}
                        className="text-[12.5px] font-medium text-navy hover:underline"
                      >
                        Review
                      </Link>
                    ) : null}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
        </Panel>
      </section>
    </div>
  );
}
