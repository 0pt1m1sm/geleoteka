import { describe, expect, it } from "vitest";

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

/**
 * Свои ящики — те, что заведены в справочнике почтовых адресов. Адрес с
 * префиксом «!» изображает отключённый ящик: он в справочнике есть, но им
 * больше не пользуются.
 */
function client(ownMailboxes: string[]) {
  const created: unknown[] = [];
  return {
    created,
    tx: {
      communicationLog: { findUnique: async () => null, create: async () => ({ id: "log-1" }) },
      mailIdentity: {
        findUnique: async ({ where }: { where: { address: string } }) => {
          if (ownMailboxes.includes(where.address)) return { userId: null, isActive: true };
          if (ownMailboxes.includes(`!${where.address}`)) return { userId: null, isActive: false };
          return null;
        },
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

/**
 * Тот же случай на ВХОДЯЩЕМ пути. Письмо приезжает в два ящика сразу —
 * в архив отправленных и во входящие, — и какой из них успеет первым, зависит
 * от гонки синхронизаторов. Первая версия правила закрыла только исходящий
 * путь, и следующее же диагностическое письмо снова встало в очередь: тот же
 * дефект, вошедший через вторую дверь.
 */
async function resolveInbound(from: string, own: string[]) {
  const { resolveInboundEmail } = await import("@/lib/email/resolve");
  const c = client(own);
  const res = await resolveInboundEmail({
    parsed: parsed(["sales@geleoteka.ru"], from) as never,
    client: {
      ...c.tx,
      // Возвращаем то, что просили создать: publish сверяет тождество события
      // и на подделке с чужими полями справедливо ругается.
      staffNotificationEvent: {
        create: async ({ data }: { data: Record<string, unknown> }) => ({ id: "ev-1", ...data }),
        upsert: async ({ create }: { create: Record<string, unknown> }) => ({ id: "ev-1", ...create }),
      },
    } as never,
    emailMessageId: "em-1",
  });
  return { res, created: c.created };
}

describe("входящее письмо от нас самих", () => {
  it("от своего ящика — в очередь разбора НЕ попадает", async () => {
    const { res, created } = await resolveInbound("sales@geleoteka.ru", ["sales@geleoteka.ru"]);
    expect(res.kind).toBe("ignored");
    expect(created).toHaveLength(0);
  });

  it("от клиента — по-прежнему ждёт разбора", async () => {
    // Граница: неизвестный отправитель — это ровно то, ради чего очередь есть.
    const { res, created } = await resolveInbound("klient@example.com", ["sales@geleoteka.ru"]);
    expect(res.kind).toBe("inbox");
    expect(created).toHaveLength(1);
  });
});

describe("отключённый ящик остаётся нашим", () => {
  it("письмо со старого служебного адреса не идёт в разбор", async () => {
    // Адрес не перестаёт быть своим оттого, что им больше не пользуются:
    // письмо с parts@ или service@ — по-прежнему не переписка с клиентом.
    const { res, created } = await resolveInbound("service@geleoteka.ru", ["!service@geleoteka.ru"]);
    expect(res.kind).toBe("ignored");
    expect(created).toHaveLength(0);
  });
});
