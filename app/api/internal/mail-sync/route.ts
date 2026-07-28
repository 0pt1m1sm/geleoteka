import { timingSafeEqual } from "node:crypto";

import { NextResponse } from "next/server";

import { loadMailSyncRuntime } from "@/lib/email/mail-sync-config";
import { runSyncOnce } from "@/lib/email/sync";

export const dynamic = "force-dynamic";

/**
 * Internal mail-sync trigger — the FALLBACK for hosts that cannot run the
 * standalone worker (`scripts/mail-sync-worker.ts` is the primary path). An
 * external scheduler POSTs here on an interval; each call runs ONE bounded batch.
 *
 * Guarantees kept deliberately narrow:
 *   - Auth is a constant-time Bearer check against `MAIL_SYNC_CRON_SECRET`; with
 *     no secret set the endpoint is closed (503), never open.
 *   - The caller supplies NO mailbox, folder, or UID — the sources come only
 *     from server config, so this cannot be pointed at an arbitrary mailbox.
 *   - The response carries counts only: never secrets, never a raw error string.
 */

/** Length-independent constant-time compare. */
function bearerMatches(presented: string, secret: string): boolean {
  const a = Buffer.from(presented);
  const b = Buffer.from(secret);
  if (a.length !== b.length) {
    // Still burn a comparison so a length mismatch is not a timing oracle.
    timingSafeEqual(b, b);
    return false;
  }
  return timingSafeEqual(a, b);
}

export async function POST(request: Request): Promise<NextResponse> {
  const secret = process.env.MAIL_SYNC_CRON_SECRET ?? "";
  if (secret.length === 0) {
    return NextResponse.json({ error: "not configured" }, { status: 503 });
  }

  const auth = request.headers.get("authorization") ?? "";
  const presented = auth.startsWith("Bearer ") ? auth.slice("Bearer ".length) : "";
  if (presented.length === 0 || !bearerMatches(presented, secret)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const runtime = await loadMailSyncRuntime();
  if (!runtime.enabled) {
    return NextResponse.json({ skipped: true, reason: "disabled" });
  }
  if (runtime.config.sources.length === 0) {
    return NextResponse.json({ skipped: true, reason: "no-sources" });
  }

  try {
    // Keep a route-triggered batch small so it stays well inside request limits;
    // the scheduler calls again to drain a backlog.
    const results = await runSyncOnce({ ...runtime.config, batchSize: 25 }, runtime.deps);
    return NextResponse.json({
      ok: true,
      sources: results.map((r) => ({
        mailbox: r.mailbox,
        folder: r.folder,
        role: r.role,
        skipped: r.skipped,
        processed: r.processed,
        created: r.created,
        duplicates: r.duplicates,
        dead: r.dead,
        vanished: r.vanished,
        lag: r.lag,
        // Boolean only — the actual error text stays server-side.
        errored: r.error !== null,
      })),
    });
  } catch {
    return NextResponse.json({ error: "sync failed" }, { status: 500 });
  }
}
