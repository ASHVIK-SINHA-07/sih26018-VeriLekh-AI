/**
 * Extraction worker.
 *
 * Runs as its own process, separate from the web server, and drains the
 * extraction queue one job at a time. Several copies can run at once — the
 * SKIP LOCKED claim in src/lib/queue.ts guarantees no job is processed twice.
 *
 * Started by docker compose as the `worker` service. Locally:
 *   node --import ./scripts/register-hooks.mjs src/worker.ts
 */
import { claimNext, markDone, markFailed, queueDepth } from "@/lib/queue";
import { runExtraction } from "@/lib/pipeline";
import { db } from "@/lib/db";

/** How long to wait before looking again when the queue is empty. */
const IDLE_POLL_MS = Number(process.env.WORKER_POLL_MS ?? 2000);

const label = process.env.WORKER_NAME ?? "worker";
let stopping = false;

function log(message: string) {
  console.log(`[${label}] ${new Date().toISOString()} ${message}`);
}

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    log(`${signal} — finishing the current job, then stopping`);
    stopping = true;
  });
}

async function main() {
  const depth = await queueDepth();
  log(`started · queued=${depth.queued} running=${depth.running} failed=${depth.failed}`);

  while (!stopping) {
    const job = await claimNext();

    if (!job) {
      await new Promise((r) => setTimeout(r, IDLE_POLL_MS));
      continue;
    }

    const startedAt = Date.now();
    try {
      const result = await runExtraction(job.documentId);
      await markDone(job.id);
      log(
        `done ${job.documentId} → ${result.status} ` +
          `(${result.validation.issues.length} issues, ${Date.now() - startedAt}ms)`,
      );
    } catch (error) {
      const outcome = await markFailed(job, error);
      log(
        `FAILED ${job.documentId} attempt ${job.attempts} — ${outcome}: ` +
          (error instanceof Error ? error.message : String(error)),
      );
    }
  }

  await db.$disconnect();
  log("stopped");
}

main().catch(async (error) => {
  log(`fatal: ${error instanceof Error ? error.message : String(error)}`);
  await db.$disconnect();
  process.exitCode = 1;
});
