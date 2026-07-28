/**
 * Long-running mail sync worker.
 *
 * A SEPARATE process from the Next web app — never an in-request `setInterval`.
 * Each cycle runs one bounded pass over every configured source and then sleeps.
 * A source's DB lease is taken and released within a single pass, so between
 * cycles nothing is held: a crash simply lets the (already-released, or expiring)
 * lease free up for the next worker. SIGINT/SIGTERM stop the loop after the
 * in-flight pass, close any open IMAP connection (handled inside syncSource's
 * finally), and disconnect Prisma.
 *
 * Run: `npm run mail:sync-worker`. Secrets come from env; non-secret config from
 * the Setting table (see lib/email/mail-sync-config.ts). Does nothing unless
 * MAIL_SYNC_ENABLED is true.
 */
import "dotenv/config";

import { db } from "../lib/db";
import { loadMailSyncRuntime } from "../lib/email/mail-sync-config";
import { runSyncOnce, type SourceSyncResult } from "../lib/email/sync";

const INTERVAL_MS = positiveInt(process.env.MAIL_SYNC_INTERVAL_MS, 60_000);

let stopping = false;

function requestStop(signal: string): void {
  if (stopping) return;
  stopping = true;
  console.log(`[mail-sync-worker] ${signal} received — finishing current pass, then exiting`);
}

async function interruptibleSleep(ms: number): Promise<void> {
  const step = 250;
  let waited = 0;
  while (waited < ms && !stopping) {
    await new Promise((r) => setTimeout(r, Math.min(step, ms - waited)));
    waited += step;
  }
}

function summarize(results: SourceSyncResult[]): string {
  return results
    .map((r) => {
      const state = r.skipped ? "leased-by-other" : r.error ? `error(${r.error})` : "ok";
      return `${r.mailbox}/${r.folder}[${r.role}] ${state} processed=${r.processed} created=${r.created} dup=${r.duplicates} dead=${r.dead} vanished=${r.vanished} lag=${r.lag}`;
    })
    .join(" | ");
}

async function main(): Promise<void> {
  process.on("SIGINT", () => requestStop("SIGINT"));
  process.on("SIGTERM", () => requestStop("SIGTERM"));

  const runtime = await loadMailSyncRuntime();
  if (!runtime.enabled) {
    console.log("[mail-sync-worker] MAIL_SYNC_ENABLED is not true — nothing to do, exiting");
    return;
  }
  if (runtime.config.sources.length === 0) {
    console.log("[mail-sync-worker] no sources configured (MAIL_SYNC_SOURCES empty) — exiting");
    return;
  }

  console.log(
    `[mail-sync-worker] starting owner=${runtime.config.owner} interval=${INTERVAL_MS}ms sources=${runtime.config.sources.length}`,
  );

  while (!stopping) {
    const started = Date.now();
    try {
      const results = await runSyncOnce(runtime.config, runtime.deps);
      console.log(`[mail-sync-worker] pass in ${Date.now() - started}ms: ${summarize(results)}`);
    } catch (err) {
      // A pass should never throw (syncSource swallows per-source failures), but
      // if the config/DB itself broke, keep the loop alive and retry next cycle.
      console.error("[mail-sync-worker] pass failed", err);
    }
    if (!stopping) await interruptibleSleep(INTERVAL_MS);
  }

  console.log("[mail-sync-worker] stopped");
}

function positiveInt(raw: string | undefined, fallback: number): number {
  const n = raw ? Number.parseInt(raw, 10) : NaN;
  return Number.isInteger(n) && n > 0 ? n : fallback;
}

main()
  .catch((err) => {
    console.error("[mail-sync-worker] fatal", err);
    process.exitCode = 1;
  })
  .finally(() => {
    void db.$disconnect();
  });
