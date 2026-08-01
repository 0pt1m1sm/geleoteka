/**
 * Resend receiving is permanently retired. Keep the former webhook URL as a
 * minimal tombstone so stale senders get an explicit response instead of a
 * generic 404. Do not parse the request or touch the database here.
 *
 * Legacy Resend attachment reads remain available through the authenticated
 * admin attachment routes; those are independent of this ingestion endpoint.
 */
export function POST(): Response {
  return Response.json(
    { error: "resend_inbound_retired" },
    {
      status: 410,
      headers: { "Cache-Control": "no-store" },
    },
  );
}
