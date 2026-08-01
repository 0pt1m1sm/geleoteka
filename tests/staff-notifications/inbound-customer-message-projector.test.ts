import { describe, expect, it } from "vitest";

import {
  projectPendingInboundCustomerMessages,
  type InboundCustomerMessageProjectorDb,
} from "@/lib/staff-notifications/projectors/inbound-customer-message";
import type { StaffNotificationEventRecord } from "@/lib/staff-notifications/types";
import { TENANT_KEY } from "@/lib/tenant";
import { FakeEmailDb } from "../email/fake-db";

const NOW = new Date("2026-08-01T12:00:00.000Z");

describe("inbound customer message projector retries", () => {
  it("moves a transient failure to DEAD at the attempt limit and never selects it again", async () => {
    const db = new FakeEmailDb();
    db.staffNotificationEvents.push({
      ...eventRecord(),
      routingStatus: "PENDING",
      routingAttempts: 4,
      nextRoutingAt: new Date("2026-08-01T11:59:00.000Z"),
      routedAt: null,
      lastRoutingError: null,
    });
    db.communicationLogFindUniqueError = new Error("database response with private content");

    await expect(projectPendingInboundCustomerMessages(projectorDb(db), 25, NOW)).resolves.toBe(0);
    expect(db.staffNotificationEvents[0]).toMatchObject({
      routingStatus: "DEAD",
      routingAttempts: 5,
      lastRoutingError: "TRANSIENT_FAILURE",
    });
    expect(String(db.staffNotificationEvents[0].lastRoutingError)).not.toContain("private content");

    await expect(projectPendingInboundCustomerMessages(projectorDb(db), 25, NOW)).resolves.toBe(0);
    expect(db.communicationLogFindUniqueCalls).toBe(1);
  });

  it("does not select a retry before nextRoutingAt", async () => {
    const db = new FakeEmailDb();
    db.staffNotificationEvents.push({
      ...eventRecord(),
      routingStatus: "RETRY",
      routingAttempts: 1,
      nextRoutingAt: new Date("2026-08-01T12:01:00.000Z"),
      routedAt: null,
      lastRoutingError: "TRANSIENT_FAILURE",
    });
    db.communicationLogFindUniqueError = new Error("still unavailable");

    await expect(projectPendingInboundCustomerMessages(projectorDb(db), 25, NOW)).resolves.toBe(0);
    expect(db.communicationLogFindUniqueCalls).toBe(0);
    expect(db.staffNotificationEvents[0]).toMatchObject({
      routingStatus: "RETRY",
      routingAttempts: 1,
    });
  });
});

function projectorDb(db: FakeEmailDb): InboundCustomerMessageProjectorDb {
  return db as unknown as InboundCustomerMessageProjectorDb;
}

function eventRecord(): StaffNotificationEventRecord {
  return {
    id: "event_poison",
    tenantKey: TENANT_KEY,
    type: "INBOUND_CUSTOMER_MESSAGE",
    priority: "P0",
    channel: "EMAIL_INBOUND",
    dedupeKey: "inbound-msg:comm_missing",
    sourceType: "CommunicationLog",
    sourceId: "comm_missing",
    relatedCustomerUserId: "customer_1",
    relatedDealId: null,
    relatedTaskId: null,
    targetUserId: null,
    fallbackPermission: "crm.manage",
    summary: "Новое письмо от клиента",
    actionPath: "/admin/customers/customer_1#communication-comm_missing",
    occurredAt: NOW,
    createdAt: NOW,
  };
}
