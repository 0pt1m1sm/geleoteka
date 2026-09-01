import { describe, expect, it, vi } from "vitest";

/**
 * Письмо самим себе не должно вставать в очередь разбора.
 *
 * Очередь существует ради писем, на которые кто-то должен ответить. Служебное
 * письмо с sales@ на sales@ ответа не требует и, попав туда, выглядит как
 * задача для менеджера — так и случилось 01.09 с диагностическим письмом.
 *
 * Правило шире одного случая: переписка сотрудников между рабочими ящиками —
 * тоже не переписка с клиентом.
 */

function parsed(to: string[], from = "sales@geleoteka.ru") {
  return {
    from: { email: from, name: "Geleoteka" },
    to: to.map((email) => ({ email, name: null })),
    cc: [],
    rfcMessageId: "<probe@geleoteka.ru>",
    subject: "Проверка отправки",
    bodyText: "текст",
    bodyHtml: null,
    occurredAt: new Date("2026-09-01T19:54:08Z"),
    source: { mailbox: "crm-archive@geleoteka.ru", folder: "INBOX" },
    attachments: [],
    inReplyTo: null,
    references: [],
  };
}

/** Свои ящики — те, что заведены в справочнике почтовых адресов. */
function client(ownMailboxes: string[]) {
  const created: unknown[] = [];
  return {
    created,
    tx: {
      communicationLog: { findUnique: async () => null, create: async () => ({ id: "log-1" }) },
      mailIdentity: {
        findUnique: async ({ where }: { where: { address: string } }) =>
          ownMailboxes.includes(where.address) ? { userId: null, isActive: true } : null,
      },
      user: { findFirst: async () => null, findMany: async () => [] },
      customerContact: { findFirst: async () => null },
      customerProfile: { findFirst: async () => null },
      deal: { findFirst: async () => null },
      inboxMessage: {
        create: async (args: unknown) => {
          created.push(args);
          return { id: "inbox-1" };
        },
      },
      emailMessage: { findFirst: async () => null },
    },
  };
}

async function resolve(to: string[], own: string[]) {
  const { resolveOutboundEmail } = await import("@/lib/email/resolve");
  const c = client(own);
  const res = await resolveOutboundEmail({
    parsed: parsed(to) as never,
    client: c.tx as never,
    emailMessageId: "em-1",
  });
  return { res, created: c.created };
}

describe("исходящее письмо на свои же ящики", () => {
  it("на свой ящик — в очередь разбора НЕ попадает", async () => {
    const { res, created } = await resolve(["sales@geleoteka.ru"], ["sales@geleoteka.ru"]);
    expect(res.kind).toBe("ignored");
    expect(created).toHaveLength(0);
  });

  it("письмо чужому адресату по-прежнему ждёт разбора", async () => {
    // Граница правила: неизвестный получатель — это как раз то, ради чего
    // очередь и заведена. Угадывать клиента нельзя, это утечка переписки.
    const { res, created } = await resolve(["kto-to@example.com"], ["sales@geleoteka.ru"]);
    expect(res.kind).toBe("inbox");
    expect(created).toHaveLength(1);
  });

  it("смешанный список получателей ждёт разбора", async () => {
    // Если рядом со своим ящиком стоит чужой — письмо адресовано человеку.
    const { res } = await resolve(["sales@geleoteka.ru", "kto-to@example.com"], ["sales@geleoteka.ru"]);
    expect(res.kind).toBe("inbox");
  });

  it("письмо без получателей — к человеку, а не в тишину", async () => {
    // Пустой список своим не считается: это странность, пусть посмотрят.
    const { res } = await resolve([], ["sales@geleoteka.ru"]);
    expect(res.kind).toBe("inbox");
  });
});
