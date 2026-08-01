import {
  inboundCommunicationCopy,
  type InboundCommChannel,
} from "@/lib/crm/inbound-communications";
import {
  inboundCustomerMessageDedupeKey,
  publishStaffNotificationEvent,
  type StaffNotificationPublishTx,
} from "@/lib/staff-notifications/publish";
import type { StaffNotificationEventRecord } from "@/lib/staff-notifications/types";
import { makeAdminActionUrl } from "@/lib/staff-notifications/safe-action-url";

export interface PublishInboundCustomerMessageInput {
  communicationLogId: string;
  customerUserId: string;
  customerName: string;
  dealId: string | null;
  channel: InboundCommChannel;
  occurredAt: Date;
}

/**
 * The one channel-neutral producer for an inbound customer communication.
 *
 * Adapters own their transport envelope, but once they have created a
 * CommunicationLog they call this function in the same transaction. No email,
 * address, subject or message body crosses this boundary.
 */
export async function publishInboundCustomerMessage(
  client: StaffNotificationPublishTx,
  input: PublishInboundCustomerMessageInput,
): Promise<StaffNotificationEventRecord> {
  const communicationLogId = requireNonBlank(
    input.communicationLogId,
    "communicationLogId",
  );
  const customerUserId = requireNonBlank(input.customerUserId, "customerUserId");
  const customerName = normalizeCustomerName(input.customerName);
  const copy = inboundCommunicationCopy(input.channel);
  const actionBase = input.dealId
    ? `/admin/crm/deals/${encodeURIComponent(input.dealId)}`
    : `/admin/customers/${encodeURIComponent(customerUserId)}`;

  return publishStaffNotificationEvent(client, {
    type: "INBOUND_CUSTOMER_MESSAGE",
    channel: input.channel,
    dedupeKey: inboundCustomerMessageDedupeKey(communicationLogId),
    sourceType: "CommunicationLog",
    sourceId: communicationLogId,
    relatedCustomerUserId: customerUserId,
    relatedDealId: input.dealId,
    safeSummary: `${copy.notificationLead}\n${customerName}`,
    actionPath: makeAdminActionUrl(
      `${actionBase}#communication-${encodeURIComponent(communicationLogId)}`,
    ),
    occurredAt: input.occurredAt,
  });
}

function normalizeCustomerName(value: string): string {
  const normalized = value.trim().replace(/\s+/g, " ");
  return (normalized || "клиент").slice(0, 200);
}

function requireNonBlank(value: string, field: string): string {
  if (value.trim().length === 0) throw new Error(`${field} must not be blank`);
  return value;
}
