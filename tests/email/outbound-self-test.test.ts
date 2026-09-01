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
