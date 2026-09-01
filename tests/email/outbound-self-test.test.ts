import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Машинная проверка исходящей почты.
 *
 * Смысл в том, ЧТО именно она доказывает: соединение поднимается из сети
 * приложения, а не с чужой машины. Поэтому она обязана отличать «сеть не
 * выпускает» от «сервер не принял доступы» — это разные починки, и путать их
 * нельзя. Письмо при этом не отправляется.
 */

const settings = new Map<string, string>();
vi.mock("@/lib/settings", () => ({
  getSetting: async (k: string) => settings.get(k) ?? null,
}));
vi.mock("server-only", () => ({}));

function err(code: string, responseCode?: number): Error {
  return Object.assign(new Error("boom"), { code, responseCode });
}

async function check(createTransporter: () => unknown) {
  const { checkOutboundReachability } = await import("@/lib/email/self-test");
  return checkOutboundReachability({
    createTransporter: createTransporter as never,
  });
}

describe("проверка исходящей почты", () => {
  beforeEach(() => {
    vi.resetModules();
    settings.clear();
    settings.set("EMAIL_TRANSPORT", "smtp");
    settings.set("SMTP_HOST", "smtp.timeweb.ru");
    settings.set("SMTP_PORT", "465");
    settings.set("SMTP_USER", "sales@geleoteka.ru");
    process.env.SMTP_PASSWORD = "секрет";
  });

  it("соединение и авторизация прошли — ok", async () => {
    const res = await check(() => ({ verify: async () => true }));
    expect(res).toMatchObject({ ok: true, code: "ok", host: "smtp.timeweb.ru", port: 465 });
  });

  it("сеть не выпускает — connect_failed, а не auth_failed", async () => {
    // Главный случай: именно ради него проверка и делалась. Заблокированный
    // исходящий порт нельзя объявить неверным паролем — чинить надо файрвол.
    const res = await check(() => ({
      verify: async () => {
        throw err("ECONNREFUSED");
      },
    }));
    expect(res).toMatchObject({ ok: false, code: "connect_failed" });
  });

  it("сервер не принял доступы — auth_failed", async () => {
    const res = await check(() => ({
      verify: async () => {
        throw err("EAUTH", 535);
      },
    }));
    expect(res).toMatchObject({ ok: false, code: "auth_failed" });
  });

  it("молчание в сокет — timeout, отдельно от отказа", async () => {
    // Тихо отброшенный пакет выглядит иначе, чем закрытый порт: это чаще всего
    // фильтрация, а не отсутствие маршрута.
    const res = await check(() => ({
      verify: async () => {
        throw err("ETIMEDOUT");
      },
    }));
    expect(res).toMatchObject({ ok: false, code: "timeout" });
  });

  it("без пароля не ходит в сеть вовсе", async () => {
    delete process.env.SMTP_PASSWORD;
    const called = vi.fn();
    const res = await check(() => {
      called();
      return { verify: async () => true };
    });
    expect(res.code).toBe("not_configured");
    expect(called).not.toHaveBeenCalled();
  });

  it("на Resend отвечает «не применимо», а не выдуманным успехом", async () => {
    // Доступность чужого HTTPS-API ничего не говорит о нашем SMTP.
    settings.set("EMAIL_TRANSPORT", "resend");
    const res = await check(() => ({ verify: async () => true }));
    expect(res).toMatchObject({ transport: "resend", code: "not_applicable", ok: false });
  });

  it("наружу не утекают ни доступы, ни текст ошибки", async () => {
    const res = await check(() => ({
      verify: async () => {
        throw Object.assign(new Error("535 5.7.8 pass=SEKRET"), { code: "EAUTH" });
      },
    }));
    expect(JSON.stringify(res)).not.toContain("SEKRET");
    expect(JSON.stringify(res)).not.toContain("секрет");
  });
});

describe("проба альтернативных портов", () => {
  beforeEach(() => {
    vi.resetModules();
    settings.clear();
    settings.set("EMAIL_TRANSPORT", "smtp");
    settings.set("SMTP_HOST", "smtp.timeweb.ru");
    settings.set("SMTP_PORT", "465");
    settings.set("SMTP_USER", "sales@geleoteka.ru");
    process.env.SMTP_PASSWORD = "секрет";
  });

  async function probe(port: number | undefined, capture: (o: Record<string, unknown>) => void) {
    const { checkOutboundReachability } = await import("@/lib/email/self-test");
    return checkOutboundReachability({
      portOverride: port,
      createTransporter: ((o: Record<string, unknown>) => {
        capture(o);
        return { verify: async () => true };
      }) as never,
    });
  }

  it("проба идёт на указанный порт, а не на настроенный", async () => {
    // Ради этого проба и нужна: провайдер режет 465 и пропускает 587.
    let opts: Record<string, unknown> = {};
    const res = await probe(587, (o) => (opts = o));
    expect(res.port).toBe(587);
    expect(opts.port).toBe(587);
  });

  it("на 587 соединение начинается открытым и обязано подняться в TLS", async () => {
    // Иначе доступы ушли бы по чистому каналу.
    let opts: Record<string, unknown> = {};
    await probe(587, (o) => (opts = o));
    expect(opts.secure).toBe(false);
    expect(opts.requireTLS).toBe(true);
  });

  it("на 465 остаётся неявный TLS", async () => {
    let opts: Record<string, unknown> = {};
    await probe(465, (o) => (opts = o));
    expect(opts.secure).toBe(true);
  });

  it("непочтовый порт не проверяется вовсе", async () => {
    // Иначе внутренняя ручка стала бы сканером чужих портов нашими руками.
    const called = vi.fn();
    const res = await probe(8080, called);
    expect(res.code).toBe("not_applicable");
    expect(called).not.toHaveBeenCalled();
  });

  it("без указания порта берётся настроенный", async () => {
    let opts: Record<string, unknown> = {};
    const res = await probe(undefined, (o) => (opts = o));
    expect(res.port).toBe(465);
    expect(opts.port).toBe(465);
  });
});

describe("проба чужого почтового сервера", () => {
  beforeEach(() => {
    vi.resetModules();
    settings.clear();
    settings.set("EMAIL_TRANSPORT", "smtp");
    settings.set("SMTP_HOST", "smtp.timeweb.ru");
    settings.set("SMTP_PORT", "465");
    settings.set("SMTP_USER", "sales@geleoteka.ru");
    process.env.SMTP_PASSWORD = "секрет";
  });

  async function probeHost(host: string | undefined, opts: { fail?: unknown } = {}) {
    const seen: Record<string, unknown>[] = [];
    const { checkOutboundReachability } = await import("@/lib/email/self-test");
    const res = await checkOutboundReachability({
      hostOverride: host,
      createTransporter: ((o: Record<string, unknown>) => {
        seen.push(o);
        return {
          verify: async () => {
            if (opts.fail) throw opts.fail;
            return true;
          },
        };
      }) as never,
    });
    return { res, opts: seen[0] };
  }

  it("НА ЧУЖОЙ СЕРВЕР ДОСТУПЫ НЕ УХОДЯТ", async () => {
    // Главное требование истории: диагностика не имеет права отдать наш пароль
    // третьей стороне. Проверяется достижимость, а не вход.
    const { res, opts } = await probeHost("smtp.gmail.com");
    expect(opts).not.toHaveProperty("auth");
    expect(res.authenticated).toBe(false);
    expect(res.host).toBe("smtp.gmail.com");
  });

  it("на своём сервере авторизация проверяется", async () => {
    const { res, opts } = await probeHost(undefined);
    expect(opts.auth).toEqual({ user: "sales@geleoteka.ru", pass: "секрет" });
    expect(res.authenticated).toBe(true);
  });

  it("хост вне списка не проверяется вовсе", async () => {
    // Иначе ручка стала бы сканером чужих портов нашими руками.
    const { res, opts } = await probeHost("evil.example.com");
    expect(res.code).toBe("not_applicable");
    expect(opts).toBeUndefined();
  });

  it("отказ авторизации на чужом сервере — это успех достижимости", async () => {
    // Соединение состоялось, раз сервер дошёл до отказа. Именно это и надо
    // выяснить: выпускает ли сеть SMTP наружу вообще.
    const { res } = await probeHost("smtp.gmail.com", {
      fail: Object.assign(new Error("nope"), { code: "EAUTH" }),
    });
    expect(res).toMatchObject({ ok: true, code: "ok", authenticated: false });
  });

  it("таймаут на чужом сервере успехом не становится", async () => {
    const { res } = await probeHost("smtp.gmail.com", {
      fail: Object.assign(new Error("nope"), { code: "ETIMEDOUT" }),
    });
    expect(res).toMatchObject({ ok: false, code: "timeout" });
  });
});

describe("проба работает и когда транспорт не SMTP", () => {
  beforeEach(() => {
    vi.resetModules();
    settings.clear();
    settings.set("EMAIL_TRANSPORT", "resend"); // прод сейчас именно такой
    settings.set("SMTP_HOST", "smtp.timeweb.ru");
    settings.set("SMTP_PORT", "465");
    settings.set("SMTP_USER", "sales@geleoteka.ru");
    process.env.SMTP_PASSWORD = "секрет";
  });

  async function run(deps: Record<string, unknown>) {
    const seen: Record<string, unknown>[] = [];
    const { checkOutboundReachability } = await import("@/lib/email/self-test");
    const res = await checkOutboundReachability({
      ...deps,
      createTransporter: ((o: Record<string, unknown>) => {
        seen.push(o);
        return { verify: async () => true };
      }) as never,
    } as never);
    return { res, opts: seen[0] };
  }

  it("явная проба выполняется, сидя на Resend", async () => {
    // Ровно тот случай, ради которого проверка и нужна: мы ушли на Resend
    // из-за блокировки и хотим знать, открылось ли что-нибудь. Первая версия
    // здесь отвечала «не применимо» и молчала.
    const { res, opts } = await run({ hostOverride: "smtp.gmail.com", portOverride: 587 });
    expect(res.code).toBe("ok");
    expect(res.host).toBe("smtp.gmail.com");
    expect(opts.port).toBe(587);
  });

  it("без пробы на Resend по-прежнему «не применимо»", async () => {
    // Доступность чужого HTTPS-API ничего не говорит о нашем SMTP.
    const { res, opts } = await run({});
    expect(res.code).toBe("not_applicable");
    expect(opts).toBeUndefined();
  });
});

describe("отправка диагностического письма", () => {
  beforeEach(() => {
    vi.resetModules();
    settings.clear();
    settings.set("SMTP_USER", "sales@geleoteka.ru");
  });

  it("письмо уходит на СВОЙ ящик, адресата выбрать нельзя", async () => {
    // Ручка за общим секретом с произвольным адресатом стала бы отправлялкой
    // чужой почты с нашего домена. Поэтому получатель берётся из конфига.
    const { sendSelfTestLetter } = await import("@/lib/email/self-test");
    let seen: { to: string; subject: string } | null = null;
    const res = await sendSelfTestLetter(async (m) => {
      seen = m;
      return { success: true, messageId: "<id@geleoteka.ru>" };
    });
    expect(seen!.to).toBe("sales@geleoteka.ru");
    expect(res).toMatchObject({ accepted: true, to: "sales@geleoteka.ru", code: "ok" });
  });

  it("отказ сервера не выдаётся за успех", async () => {
    const { sendSelfTestLetter } = await import("@/lib/email/self-test");
    const res = await sendSelfTestLetter(async () => ({ success: false, error: "550 rejected" }));
    expect(res).toMatchObject({ accepted: false, code: "rejected" });
  });

  it("без настроенного ящика не отправляет вовсе", async () => {
    settings.clear();
    const { sendSelfTestLetter } = await import("@/lib/email/self-test");
    const send = vi.fn();
    const res = await sendSelfTestLetter(send as never);
    expect(res.code).toBe("not_configured");
    expect(send).not.toHaveBeenCalled();
  });
});
