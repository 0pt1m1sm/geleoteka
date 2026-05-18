import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { getSetting } from "@/lib/settings";

export const dynamic = "force-dynamic";

const UUID_RE = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;

/**
 * Authenticated proxy for inbound email attachments. Resend stores them
 * for ~30 days; after that the upstream returns 404 → we surface 410.
 *
 * Path: `/api/admin/inbox/attachments/<attachment_id>?email_id=<resend_email_uuid>`
 *
 * Authorization layers:
 *   1. requireRole(ADMIN|MANAGER) — only admins can hit this endpoint
 *   2. UUID format check on both params (prevents path injection)
 *   3. Parent-existence check — the email_id MUST exist in either
 *      `InboxMessage.resendEmailId` or `CommunicationLog.resendEmailId`,
 *      preventing this from becoming an open proxy for arbitrary Resend emails.
 */
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    await requireRole(["ADMIN", "MANAGER"]);
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: attachmentId } = await context.params;
  const url = new URL(request.url);
  const emailId = url.searchParams.get("email_id") ?? "";

  if (!UUID_RE.test(emailId)) {
    return NextResponse.json({ error: "invalid email_id" }, { status: 400 });
  }
  if (!UUID_RE.test(attachmentId)) {
    return NextResponse.json({ error: "invalid attachment id" }, { status: 400 });
  }

  // Parent-existence check — block open-proxy use against arbitrary
  // Resend emails by ensuring the email_id corresponds to a row we own.
  const known =
    (await db.inboxMessage.findFirst({
      where: { resendEmailId: emailId },
      select: { id: true },
    })) ??
    (await db.communicationLog.findFirst({
      where: { resendEmailId: emailId },
      select: { id: true },
    }));
  if (!known) {
    return NextResponse.json({ error: "unknown email" }, { status: 404 });
  }

  const apiKey = await getSetting("RESEND_API_KEY");
  if (!apiKey) return NextResponse.json({ error: "not configured" }, { status: 503 });

  const upstream = await fetch(
    `https://api.resend.com/emails/${emailId}/attachments/${attachmentId}`,
    { headers: { Authorization: `Bearer ${apiKey}` } },
  );

  if (upstream.status === 404) {
    return NextResponse.json({ error: "expired" }, { status: 410 });
  }
  if (!upstream.ok) {
    return NextResponse.json({ error: "upstream error" }, { status: 502 });
  }

  return new Response(upstream.body, {
    status: 200,
    headers: {
      "Content-Type": upstream.headers.get("Content-Type") ?? "application/octet-stream",
      "Content-Disposition":
        upstream.headers.get("Content-Disposition") ?? `attachment`,
    },
  });
}
