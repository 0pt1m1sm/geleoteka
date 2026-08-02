import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const requireRole = vi.fn();
vi.mock("@/lib/auth", () => ({
  requireRole: (...args: unknown[]) => requireRole(...args),
}));

vi.mock("@/lib/email", () => ({
  generateOutboundMessageId: vi.fn(),
  recordOutboundEmail: vi.fn(),
  markOutboundEmailFailed: vi.fn(),
  markOutboundEmailSent: vi.fn(),
  isPlausibleEmail: vi.fn(),
}));
vi.mock("@/lib/email/send", () => ({ sendEmail: vi.fn() }));
vi.mock("@/lib/crm/follow-up-reply", () => ({
  completeFollowUpAfterReply: vi.fn(),
}));

const publishInboundCustomerMessage = vi.fn();
vi.mock("@/lib/staff-notifications/inbound-customer-message", () => ({
  publishInboundCustomerMessage: (...args: unknown[]) =>
    publishInboundCustomerMessage(...args),
}));
vi.mock("@/lib/staff-notifications/projectors/inbound-customer-message", () => ({
  projectInboundCustomerMessageEvent: vi.fn(),
}));

const dealFindFirst = vi.fn();
const userFindUnique = vi.fn();
const inboxFindUnique = vi.fn();
const contactFindUnique = vi.fn();
const communicationCreate = vi.fn();
const inboxUpdateMany = vi.fn();
const inboxUpdate = vi.fn();
const contactCreate = vi.fn();
const auditCreate = vi.fn();
const transaction = vi.fn(
  async (callback: (tx: unknown) => Promise<unknown>) =>
    callback({
      communicationLog: { create: (...args: unknown[]) => communicationCreate(...args) },
      inboxMessage: {
        updateMany: (...args: unknown[]) => inboxUpdateMany(...args),
        update: (...args: unknown[]) => inboxUpdate(...args),
      },
      customerContact: { create: (...args: unknown[]) => contactCreate(...args) },
      auditLog: { create: (...args: unknown[]) => auditCreate(...args) },
    }),
);
vi.mock("@/lib/db", () => ({
  db: {
    deal: { findFirst: (...args: unknown[]) => dealFindFirst(...args) },
    user: { findUnique: (...args: unknown[]) => userFindUnique(...args) },
    inboxMessage: {
      findUnique: (...args: unknown[]) => inboxFindUnique(...args),
      update: (...args: unknown[]) => inboxUpdate(...args),
    },
    customerContact: {
      findUnique: (...args: unknown[]) => contactFindUnique(...args),
    },
    $transaction: (callback: (tx: unknown) => Promise<unknown>) =>
      transaction(callback),
  },
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import {
  archiveInboxMessage,
  deleteInboxMessage,
  linkInboxMessageToCustomer,
  markInboxMessageSpam,
  restoreInboxMessage,
} from "@/app/actions/crm/inbox";

beforeEach(() => {
  for (const mock of [
    requireRole,
    dealFindFirst,
    userFindUnique,
    inboxFindUnique,
    contactFindUnique,
    communicationCreate,
    inboxUpdateMany,
    inboxUpdate,
    contactCreate,
    auditCreate,
    publishInboundCustomerMessage,
  ]) mock.mockReset();
  transaction.mockClear();
  requireRole.mockResolvedValue({
    id: "manager-1",
    name: "Менеджер",
    permissionRole: "MANAGER",
  });
  auditCreate.mockResolvedValue({ id: "audit-inbox" });
});

describe("inbox audit coverage", () => {
  it("links a message with ids only and excludes subject/body/from address", async () => {
    dealFindFirst.mockResolvedValue({ id: "deal-1" });
    userFindUnique.mockResolvedValue({
      email: "client@example.test",
      name: "Иван Клиент",
    });
    inboxFindUnique.mockResolvedValue({
      messageId: "rfc-message-1",
      subject: "SENSITIVE-SUBJECT",
      bodyText: "SENSITIVE-BODY",
      bodyHtml: null,
      attachments: [],
      resendEmailId: null,
      status: "PENDING",
      fromEmail: "SENSITIVE-FROM@example.test",
      direction: "INBOUND",
      emailMessageId: "email-1",
      receivedAt: new Date("2026-08-02T20:00:00.000Z"),
    });
    contactFindUnique.mockResolvedValue({ id: "contact-1" });
    communicationCreate.mockResolvedValue({ id: "comm-1" });
    inboxUpdateMany.mockResolvedValue({ count: 1 });
    publishInboundCustomerMessage.mockResolvedValue(null);

    await expect(
      linkInboxMessageToCustomer("inbox-1", "customer-1", null),
    ).resolves.toEqual({ error: null, communicationLogId: "comm-1" });

    expect(auditCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: "inbox.link",
        targetType: "InboxMessage",
        targetId: "inbox-1",
        metadata: {
          customerUserId: "customer-1",
          dealId: "deal-1",
          communicationLogId: "comm-1",
          direction: "INBOUND",
          aliasAdded: false,
        },
      }),
    });
    expect(JSON.stringify(auditCreate.mock.calls)).not.toContain("SENSITIVE-");
  });

  it.each([
    ["spam", markInboxMessageSpam, "SPAM", "inbox.spam"],
    ["archive", archiveInboxMessage, "ARCHIVED", "inbox.archive"],
    ["delete", deleteInboxMessage, "DELETED", "inbox.delete"],
    ["restore", restoreInboxMessage, "PENDING", "inbox.restore"],
  ])("audits %s without message content", async (_label, action, status, auditAction) => {
    inboxFindUnique.mockResolvedValue({ id: "inbox-1", status: "PENDING" });
    inboxUpdate.mockResolvedValue({ id: "inbox-1" });

    await expect(action("inbox-1")).resolves.toEqual({ error: null });

    expect(inboxUpdate).toHaveBeenCalledWith({
      where: { id: "inbox-1" },
      data: { status },
    });
    expect(auditCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: auditAction,
        targetType: "InboxMessage",
        targetId: "inbox-1",
        metadata: { previousStatus: "PENDING" },
      }),
    });
  });
});
