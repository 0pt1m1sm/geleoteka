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
vi.mock("@/lib/staff-notifications/inbound-customer-message", () => ({
  publishInboundCustomerMessage: vi.fn(),
}));
vi.mock("@/lib/staff-notifications/projectors/inbound-customer-message", () => ({
  projectInboundCustomerMessageEvent: vi.fn(),
}));

const deleteMailFromMailbox = vi.fn();
vi.mock("@/lib/email/mail-sync-config", () => ({
  deleteMailFromMailbox: (...args: unknown[]) => deleteMailFromMailbox(...args),
}));

const inboxFindUnique = vi.fn();
const inboxDelete = vi.fn();
const emailDelete = vi.fn();
const auditCreate = vi.fn();
const transaction = vi.fn(
  async (callback: (tx: unknown) => Promise<unknown>) =>
    callback({
      auditLog: { create: (...args: unknown[]) => auditCreate(...args) },
      inboxMessage: { delete: (...args: unknown[]) => inboxDelete(...args) },
      emailMessage: { delete: (...args: unknown[]) => emailDelete(...args) },
    }),
);
vi.mock("@/lib/db", () => ({
  db: {
    inboxMessage: {
      findUnique: (...args: unknown[]) => inboxFindUnique(...args),
    },
    $transaction: (callback: (tx: unknown) => Promise<unknown>) =>
      transaction(callback),
  },
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { destroyInboxMessageForever } from "@/app/actions/crm/inbox";

function imapMessage(overrides: Record<string, unknown> = {}) {
  return {
    id: "inbox-1",
    status: "PENDING",
    linkedCommunicationLogId: null,
    emailMessage: {
      id: "email-1",
      provider: "TIMEWEB_IMAP",
      sourceMailbox: "sales@geleoteka.ru",
      sourceFolder: "INBOX",
      uid: 42n,
      uidValidity: 7n,
      communicationLogs: [],
    },
    ...overrides,
  };
}

beforeEach(() => {
  for (const mock of [
    requireRole,
    inboxFindUnique,
    inboxDelete,
    emailDelete,
    auditCreate,
    deleteMailFromMailbox,
  ]) mock.mockReset();
  transaction.mockClear();
  requireRole.mockResolvedValue({
    id: "admin-1",
    name: "Админ",
    permissionRole: "ADMIN",
  });
  auditCreate.mockResolvedValue({ id: "audit-1" });
});

describe("destroyInboxMessageForever", () => {
  it("demands the ADMIN role and reports a missing message", async () => {
    inboxFindUnique.mockResolvedValue(null);

    await expect(destroyInboxMessageForever("inbox-x")).resolves.toEqual({
      error: "Сообщение не найдено",
    });
    expect(requireRole).toHaveBeenCalledWith(["ADMIN"]);
    expect(transaction).not.toHaveBeenCalled();
  });

  it("refuses when the message is linked to a customer thread", async () => {
    inboxFindUnique.mockResolvedValue(
      imapMessage({ linkedCommunicationLogId: "comm-1" }),
    );

    const result = await destroyInboxMessageForever("inbox-1");

    expect(result.error).toContain("привязано к переписке");
    expect(deleteMailFromMailbox).not.toHaveBeenCalled();
    expect(transaction).not.toHaveBeenCalled();
  });

  it("refuses when the email row is referenced by any communication log", async () => {
    const msg = imapMessage();
    (msg.emailMessage as { communicationLogs: unknown[] }).communicationLogs = [
      { id: "comm-2" },
    ];
    inboxFindUnique.mockResolvedValue(msg);

    const result = await destroyInboxMessageForever("inbox-1");

    expect(result.error).toContain("привязано к переписке");
    expect(deleteMailFromMailbox).not.toHaveBeenCalled();
    expect(transaction).not.toHaveBeenCalled();
  });

  it("aborts and keeps CRM rows when the mailbox deletion fails", async () => {
    inboxFindUnique.mockResolvedValue(imapMessage());
    deleteMailFromMailbox.mockRejectedValue(new Error("imap down"));

    const result = await destroyInboxMessageForever("inbox-1");

    expect(result.error).toContain("ничего не тронуто");
    expect(transaction).not.toHaveBeenCalled();
    expect(inboxDelete).not.toHaveBeenCalled();
    expect(emailDelete).not.toHaveBeenCalled();
  });

  it("stops on a re-indexed mailbox and asks for a fresh sync", async () => {
    inboxFindUnique.mockResolvedValue(imapMessage());
    deleteMailFromMailbox.mockResolvedValue("uidvalidity-changed");

    const result = await destroyInboxMessageForever("inbox-1");

    expect(result.error).toContain("переиндексирован");
    expect(transaction).not.toHaveBeenCalled();
  });

  it("deletes from the mailbox first, then both CRM rows, with an id-only audit", async () => {
    inboxFindUnique.mockResolvedValue(imapMessage());
    deleteMailFromMailbox.mockResolvedValue("deleted");

    await expect(destroyInboxMessageForever("inbox-1")).resolves.toEqual({
      error: null,
    });

    expect(deleteMailFromMailbox).toHaveBeenCalledWith({
      mailbox: "sales@geleoteka.ru",
      folder: "INBOX",
      uid: 42n,
      uidValidity: 7n,
    });
    expect(inboxDelete).toHaveBeenCalledWith({ where: { id: "inbox-1" } });
    expect(emailDelete).toHaveBeenCalledWith({ where: { id: "email-1" } });
    expect(auditCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: "inbox.destroy",
        targetType: "InboxMessage",
        targetId: "inbox-1",
        metadata: {
          previousStatus: "PENDING",
          emailMessageId: "email-1",
          imapOutcome: "deleted",
        },
      }),
    });
  });

  it("skips IMAP for messages without mailbox coordinates and still purges CRM", async () => {
    inboxFindUnique.mockResolvedValue(
      imapMessage({
        emailMessage: {
          id: "email-2",
          provider: "RESEND",
          sourceMailbox: "sales@geleoteka.ru",
          sourceFolder: "",
          uid: null,
          uidValidity: null,
          communicationLogs: [],
        },
      }),
    );

    await expect(destroyInboxMessageForever("inbox-1")).resolves.toEqual({
      error: null,
    });

    expect(deleteMailFromMailbox).not.toHaveBeenCalled();
    expect(emailDelete).toHaveBeenCalledWith({ where: { id: "email-2" } });
    expect(auditCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        metadata: expect.objectContaining({ imapOutcome: "no-imap-copy" }),
      }),
    });
  });

  it("purges an inbox row that has no email message at all", async () => {
    inboxFindUnique.mockResolvedValue(imapMessage({ emailMessage: null }));

    await expect(destroyInboxMessageForever("inbox-1")).resolves.toEqual({
      error: null,
    });

    expect(deleteMailFromMailbox).not.toHaveBeenCalled();
    expect(inboxDelete).toHaveBeenCalledWith({ where: { id: "inbox-1" } });
    expect(emailDelete).not.toHaveBeenCalled();
  });
});
