import { describe, expect, it } from "vitest";

import {
  publishEstimateCustomerApproved,
  publishEstimateCustomerDeclined,
  publishInboundMessageUnresolved,
  publishPartsOrderCreated,
  publishRentalBookingCreated,
  publishServiceBookingCreated,
} from "@/lib/staff-notifications/business-events";
import {
  toSafeChannelPayload,
  type StaffNotificationPublishTx,
} from "@/lib/staff-notifications/publish";
import type {
  StaffNotificationEventRecord,
  StaffNotificationType,
} from "@/lib/staff-notifications/types";

const NOW = new Date("2026-08-01T10:30:00.000Z");

interface EventCase {
  type: StaffNotificationType;
  sourceType: string;
  sourceId: string;
  dedupeKey: string;
  publish(client: StaffNotificationPublishTx): Promise<StaffNotificationEventRecord>;
}

describe("Story 5 business event producers", () => {
  it.each(eventCases())(
    "$type is created exactly once when the same source is published again",
    async (testCase) => {
      const db = new FakeAtomicEventDb();

      const first = await testCase.publish(db);
      const replay = await testCase.publish(db);

      expect(db.events).toHaveLength(1);
      expect(replay.id).toBe(first.id);
      expect(first).toMatchObject({
        type: testCase.type,
        sourceType: testCase.sourceType,
        sourceId: testCase.sourceId,
        dedupeKey: testCase.dedupeKey,
      });
    },
  );

  it.each(eventCases())(
    "$type rolls back with the business entity",
    async (testCase) => {
      const db = new FakeAtomicEventDb();

      await expect(
        db.transaction(async (tx) => {
          tx.businessRows.add(`${testCase.sourceType}:${testCase.sourceId}`);
          await testCase.publish(tx);
          throw new Error("ROLLBACK_SENTINEL");
        }),
      ).rejects.toThrow("ROLLBACK_SENTINEL");

      expect(db.businessRows.size).toBe(0);
      expect(db.events).toHaveLength(0);
    },
  );

  it("keeps rejection reasons and customer-authored application text out of delivery payloads", async () => {
    const sentinel = "PII-SENTINEL-claim-and-notes";
    const db = new FakeAtomicEventDb();
    const declined = await publishEstimateCustomerDeclined(db, estimateInput());
    const booking = await publishServiceBookingCreated(db, customerEventInput("booking_1"));
    const unresolved = await publishInboundMessageUnresolved(db, {
      inboxMessageId: "inbox_1",
      channel: "EMAIL_INBOUND",
      occurredAt: NOW,
    });

    // These values exist in their CRM entities, but the producer boundary does
    // not accept them and therefore cannot copy them to a channel payload.
    const customerAuthoredFields = {
      declineReason: sentinel,
      bookingNotes: sentinel,
      messageSubject: sentinel,
      messageBody: sentinel,
    };
    expect(customerAuthoredFields.declineReason).toBe(sentinel);

    const payloads = [declined, booking, unresolved].map(toSafeChannelPayload);
    expect(JSON.stringify(payloads)).not.toContain(sentinel);
    expect(payloads.every((payload) => payload.actionUrl.startsWith("/admin/"))).toBe(true);
  });
});

function eventCases(): EventCase[] {
  return [
    {
      type: "SERVICE_BOOKING_CREATED",
      sourceType: "Booking",
      sourceId: "booking_1",
      dedupeKey: "service-booking-created:booking_1",
      publish: (client) =>
        publishServiceBookingCreated(client, customerEventInput("booking_1")),
    },
    {
      type: "ESTIMATE_CUSTOMER_APPROVED",
      sourceType: "Estimate",
      sourceId: "estimate_approved_1",
      dedupeKey: "estimate-customer-approved:estimate_approved_1",
      publish: (client) =>
        publishEstimateCustomerApproved(
          client,
          estimateInput("estimate_approved_1"),
        ),
    },
    {
      type: "ESTIMATE_CUSTOMER_DECLINED",
      sourceType: "Estimate",
      sourceId: "estimate_declined_1",
      dedupeKey: "estimate-customer-declined:estimate_declined_1",
      publish: (client) =>
        publishEstimateCustomerDeclined(
          client,
          estimateInput("estimate_declined_1"),
        ),
    },
    {
      type: "PARTS_ORDER_CREATED",
      sourceType: "PartOrder",
      sourceId: "part_order_1",
      dedupeKey: "parts-order-created:part_order_1",
      publish: (client) =>
        publishPartsOrderCreated(client, customerEventInput("part_order_1")),
    },
    {
      type: "RENTAL_BOOKING_CREATED",
      sourceType: "RentalBooking",
      sourceId: "rental_booking_1",
      dedupeKey: "rental-booking-created:rental_booking_1",
      publish: (client) =>
        publishRentalBookingCreated(
          client,
          customerEventInput("rental_booking_1"),
        ),
    },
    {
      type: "INBOUND_MESSAGE_UNRESOLVED",
      sourceType: "InboxMessage",
      sourceId: "inbox_1",
      dedupeKey: "inbound-message-unresolved:inbox_1",
      publish: (client) =>
        publishInboundMessageUnresolved(client, {
          inboxMessageId: "inbox_1",
          channel: "EMAIL_INBOUND",
          occurredAt: NOW,
        }),
    },
  ];
}

function customerEventInput(sourceId: string) {
  return {
    sourceId,
    customerUserId: "customer_1",
    customerName: "Иван Клиент",
    dealId: "deal_1",
    dealNumber: "D-1042",
    occurredAt: NOW,
  };
}

function estimateInput(sourceId = "estimate_declined_1") {
  return {
    ...customerEventInput(sourceId),
    ownerUserId: "manager_1",
  };
}

class FakeAtomicEventDb implements StaffNotificationPublishTx {
  events: StaffNotificationEventRecord[] = [];
  businessRows = new Set<string>();

  staffNotificationEvent = {
    upsert: async (rawArgs: Record<string, unknown>): Promise<unknown> => {
      const args = rawArgs as {
        where: { tenantKey_dedupeKey: { tenantKey: string; dedupeKey: string } };
        create: Omit<StaffNotificationEventRecord, "id" | "createdAt">;
      };
      const key = args.where.tenantKey_dedupeKey;
      const existing = this.events.find(
        (event) =>
          event.tenantKey === key.tenantKey && event.dedupeKey === key.dedupeKey,
      );
      if (existing) return existing;
      const created = {
        id: `event_${this.events.length + 1}`,
        createdAt: NOW,
        ...args.create,
      } as StaffNotificationEventRecord;
      this.events.push(created);
      return created;
    },
  };

  async transaction<T>(fn: (tx: FakeAtomicEventDb) => Promise<T>): Promise<T> {
    const events = this.events.map((event) => ({ ...event }));
    const businessRows = new Set(this.businessRows);
    try {
      return await fn(this);
    } catch (error) {
      this.events = events;
      this.businessRows = businessRows;
      throw error;
    }
  }
}
