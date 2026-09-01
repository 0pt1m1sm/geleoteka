import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Срок жизни ссылки на присвоение заказа.
 *
 * Токен уходит человеку в SMS вместе с временным паролем и до этой правки жил
 * вечно: ссылка годовой давности из чужой переписки открывала создание пароля
 * к учётной записи. Отдельной колонки под срок нет — токен выдаётся только при
 * оформлении, поэтому его возраст равен возрасту заказа.
 *
 * Истечение НЕ запирает человека: остаётся временный пароль и восстановление
 * по телефону.
 */

const TOKEN = "a".repeat(64);
const DAY = 24 * 60 * 60 * 1000;

const findUnique = vi.fn();
const userFindUnique = vi.fn();

vi.mock("@/lib/db", () => ({
  db: {
    repairOrder: { findUnique: (...a: unknown[]) => findUnique(...a), update: async () => ({}) },
    rentalBooking: { findUnique: (...a: unknown[]) => findUnique(...a), update: async () => ({}) },
    partShipment: { findUnique: (...a: unknown[]) => findUnique(...a), update: async () => ({}) },
    user: { findUnique: (...a: unknown[]) => userFindUnique(...a), update: async () => ({}) },
    $transaction: async () => [],
  },
}));
vi.mock("@/lib/auth", () => ({
  createToken: () => "jwt",
  setSessionCookie: async () => {},
}));
vi.mock("bcryptjs", () => ({
  default: { hash: async () => "hash", compare: async () => true },
}));

function orderAgedDays(days: number) {
  return {
    claimToken: TOKEN,
    userId: "u1",
    contactEmail: "guest@example.com",
    createdAt: new Date(Date.now() - days * DAY),
    user: { email: "guest@example.com" },
  };
}

async function claim(days: number) {
  findUnique.mockResolvedValue(orderAgedDays(days));
  userFindUnique.mockResolvedValue({
    id: "u1",
    email: "guest@example.com",
    isTempPassword: true,
    permissionRole: "CLIENT",
    passwordHash: "hash",
  });
  const { setPasswordForGuestUser } = await import("@/app/actions/customer-onboarding");
  return setPasswordForGuestUser({
    orderId: "o1",
    orderKind: "booking",
    claimToken: TOKEN,
    email: "guest@example.com",
    password: "Parol12345",
  });
}

async function attach(days: number) {
  findUnique.mockResolvedValue(orderAgedDays(days));
  userFindUnique.mockResolvedValue({
    id: "u1",
    passwordHash: "hash",
    permissionRole: "CLIENT",
    isTempPassword: false,
  });
  const { loginAndAttachOrder } = await import("@/app/actions/customer-onboarding");
  return loginAndAttachOrder({
    orderId: "o1",
    orderKind: "cart",
    claimToken: TOKEN,
    email: "guest@example.com",
    password: "Parol12345",
  });
}

describe("срок жизни claim-токена", () => {
  beforeEach(() => {
    vi.resetModules();
    findUnique.mockReset();
    userFindUnique.mockReset();
  });

  it("свежая ссылка создаёт пароль", async () => {
    const res = await claim(1);
    expect(res.ok).toBe(true);
  });

  it("ссылка старше двух недель отклоняется", async () => {
    // Главный случай: годовалая ссылка из пересланной переписки.
    const res = await claim(15);
    expect(res).toEqual({ ok: false, error: "Неверная или истекшая ссылка claim" });
  });

  it("ровно на границе ещё работает", async () => {
    // Граница включительна: «14 дней» не должно означать 13.
    const res = await claim(13.9);
    expect(res.ok).toBe(true);
  });

  it("привязка заказа входом тоже проверяет срок", async () => {
    // Вторая дверь в тот же заказ; закрыть одну и оставить другую — не защита.
    const res = await attach(20);
    expect(res).toEqual({ ok: false, error: "Неверная или истекшая ссылка claim" });
    const fresh = await attach(2);
    expect(fresh.ok).toBe(true);
  });

  it("ответ не отличает просроченную ссылку от выдуманной", async () => {
    // Иначе ответ подсказывал бы, что заказ с таким номером существует.
    findUnique.mockResolvedValue({ ...orderAgedDays(1), claimToken: "b".repeat(64) });
    const { setPasswordForGuestUser } = await import("@/app/actions/customer-onboarding");
    const wrong = await setPasswordForGuestUser({
      orderId: "o1",
      orderKind: "booking",
      claimToken: TOKEN,
      email: "guest@example.com",
      password: "Parol12345",
    });
    const expired = await claim(30);
    expect(wrong).toEqual(expired);
  });
});
