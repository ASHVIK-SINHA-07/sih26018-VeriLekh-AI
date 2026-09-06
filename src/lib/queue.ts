import { db } from "@/lib/db";

/**
 * The extraction queue, backed by Postgres rather than a separate broker.
 *
 * `FOR UPDATE SKIP LOCKED` is the whole mechanism: a worker locks exactly one
 * QUEUED row and every other worker skips straight past it, so several workers
 * can drain the queue at once and no job is ever handed out twice. This needs
 * no Redis, no RabbitMQ and no extra container to keep alive — the database a
 * department is already backing up holds the queue too.
 */

/** How many times a failing job is retried before it is given up on. */
export const MAX_ATTEMPTS = 3;

export interface ClaimedJob {
  id: string;
  documentId: string;
  attempts: number;
}

/** Put a document in the queue, or re-queue one that already has a job. */
export async function enqueue(documentId: string): Promise<string> {
  const job = await db.extractionJob.upsert({
    where: { documentId },
    update: { status: "QUEUED", error: null, startedAt: null, finishedAt: null },
    create: { documentId },
  });

  // PROCESSING is what the screens show while a document waits its turn.
  await db.document.update({
    where: { id: documentId },
    data: { status: "PROCESSING" },
  });

  return job.id;
}

/**
 * Atomically take the oldest waiting job. Returns null when the queue is
 * empty. The UPDATE ... WHERE id = (SELECT ... SKIP LOCKED) form does the
 * claim in a single statement, so there is no window in which two workers
 * could both see the same row as available.
 */
export async function claimNext(): Promise<ClaimedJob | null> {
  const rows = await db.$queryRaw<ClaimedJob[]>`
    UPDATE "ExtractionJob"
       SET status = 'RUNNING',
           "startedAt" = now(),
           attempts = attempts + 1
     WHERE id = (
       SELECT id FROM "ExtractionJob"
        WHERE status = 'QUEUED'
        ORDER BY "createdAt"
          FOR UPDATE SKIP LOCKED
        LIMIT 1
     )
    RETURNING id, "documentId", attempts
  `;
  return rows[0] ?? null;
}

export async function markDone(jobId: string): Promise<void> {
  await db.extractionJob.update({
    where: { id: jobId },
    data: { status: "DONE", error: null, finishedAt: new Date() },
  });
}

/**
 * Record a failure. Below the retry limit the job goes back to QUEUED and is
 * picked up again; at the limit it is parked as FAILED and the document is
 * returned to UPLOADED so it is never stranded in PROCESSING with no queue
 * entry working on it.
 */
export async function markFailed(
  job: ClaimedJob,
  error: unknown,
): Promise<"retrying" | "gave-up"> {
  const message = error instanceof Error ? error.message : String(error);
  const giveUp = job.attempts >= MAX_ATTEMPTS;

  await db.extractionJob.update({
    where: { id: job.id },
    data: {
      status: giveUp ? "FAILED" : "QUEUED",
      error: message.slice(0, 500),
      finishedAt: giveUp ? new Date() : null,
    },
  });

  if (giveUp) {
    await db.document.update({
      where: { id: job.documentId },
      data: { status: "UPLOADED" },
    });
  }
  return giveUp ? "gave-up" : "retrying";
}

/** Counts for the dashboard and for operators watching the backlog. */
export async function queueDepth() {
  const rows = await db.extractionJob.groupBy({
    by: ["status"],
    _count: { _all: true },
  });
  const of = (s: string) => rows.find((r) => r.status === s)?._count._all ?? 0;
  return {
    queued: of("QUEUED"),
    running: of("RUNNING"),
    failed: of("FAILED"),
    done: of("DONE"),
  };
}
