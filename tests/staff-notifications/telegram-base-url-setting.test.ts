import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { KNOWN_SETTINGS } from "@/lib/settings";
import { validateSettingValue } from "@/lib/settings-validation";

const descriptor = KNOWN_SETTINGS.find((s) => s.key === "TELEGRAM_API_BASE_URL");
if (!descriptor) throw new Error("TELEGRAM_API_BASE_URL descriptor missing");

describe("TELEGRAM_API_BASE_URL setting", () => {
  it("дескриптор секретный: адрес релея не сериализуется клиенту", () => {
    // Открытый релей доступен любому, кто знает адрес; runbook требует
    // беречь его как токен — значит, secret, как у соседних ключей.
    expect(descriptor.secret).toBe(true);
  });

  it("невалидные значения отклоняются при сохранении, а не молча глушат канал", () => {
    for (const bad of [
      "http://relay.example",
      "https://user:pass@relay.example",
      "https://relay.example/path?x=1",
      "https://relay.example/#frag",
      "not a url",
    ]) {
      expect(validateSettingValue(descriptor, bad).ok).toBe(false);
    }
  });

  it("валидный https-адрес нормализуется при сохранении", () => {
    const result = validateSettingValue(
      descriptor,
      "https://relay.example/bot-api/",
    );
    expect(result).toEqual({ ok: true, value: "https://relay.example/bot-api" });
  });
});
