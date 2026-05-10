"use server";

import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import { db } from "@/lib/db";
import { createToken, setSessionCookie } from "@/lib/auth";
import { isValidPassword } from "@/lib/customer-onboarding";

type OrderKind = "booking" | "cart" | "rental";

function destinationFor(orderKind: OrderKind, role: string): string {
  if (role === "ADMIN" || role === "MANAGER") return "/admin";
  if (role === "MASTER") return "/master";
  if (orderKind === "booking") return "/cabinet";
  if (orderKind === "rental") return "/cabinet/rentals";
  return "/cabinet/orders";
}

function tokensMatch(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  if (aBuf.length !== bBuf.length) return false;
  return crypto.timingSafeEqual(aBuf, bBuf);
}

export type SetPasswordResult =
  | { ok: true; redirectTo: string }
  | { ok: false; error: string };

export async function setPasswordForGuestUser(input: {
  orderId: string;
  orderKind: OrderKind;
  claimToken: string;
  email: string;
  password: string;
}): Promise<SetPasswordResult> {
  if (!input.orderId || !input.claimToken || !input.email || !input.password) {
    return { ok: false, error: "Все поля обязательны" };
  }
  const passwordCheck = isValidPassword(input.password);
  if (!passwordCheck.ok) return { ok: false, error: passwordCheck.error };

  let storedToken: string | null = null;
  let userIdOnOrder: string | null = null;
  if (input.orderKind === "booking") {
    const ro = (await db.repairOrder.findUnique({
      where: { id: input.orderId },
      select: { claimToken: true, userId: true },
    })) as { claimToken: string | null; userId: string } | null;
    if (!ro) return { ok: false, error: "Неверная или истекшая ссылка claim" };
    storedToken = ro.claimToken;
    userIdOnOrder = ro.userId;
  } else if (input.orderKind === "rental") {
    const rb = (await db.rentalBooking.findUnique({
      where: { id: input.orderId },
      select: { claimToken: true, userId: true },
    })) as { claimToken: string | null; userId: string | null } | null;
    if (!rb) return { ok: false, error: "Неверная или истекшая ссылка claim" };
    storedToken = rb.claimToken;
    userIdOnOrder = rb.userId;
  } else {
    const po = (await db.partOrder.findUnique({
      where: { id: input.orderId },
      select: { claimToken: true, userId: true },
    })) as { claimToken: string | null; userId: string | null } | null;
    if (!po) return { ok: false, error: "Неверная или истекшая ссылка claim" };
    storedToken = po.claimToken;
    userIdOnOrder = po.userId;
  }
  if (!tokensMatch(storedToken, input.claimToken)) {
    return { ok: false, error: "Неверная или истекшая ссылка claim" };
  }
  if (!userIdOnOrder) {
    return { ok: false, error: "Заказ не привязан к учётной записи" };
  }

  const user = (await db.user.findUnique({
    where: { id: userIdOnOrder },
    select: { id: true, email: true, isTempPassword: true, permissionRole: true },
  })) as
    | { id: string; email: string; isTempPassword: boolean; permissionRole: string }
    | null;
  if (!user) return { ok: false, error: "Аккаунт не найден" };
  const inputEmail = input.email.trim().toLowerCase();
  if (user.email !== inputEmail) {
    return { ok: false, error: "Email не совпадает с аккаунтом" };
  }
  if (!user.isTempPassword) {
    return { ok: false, error: "У этого аккаунта уже есть пароль. Войдите." };
  }

  const passwordHash = await bcrypt.hash(input.password, 12);
  const clearTokenOp =
    input.orderKind === "booking"
      ? db.repairOrder.update({
          where: { id: input.orderId },
          data: { claimToken: null },
        })
      : input.orderKind === "rental"
      ? db.rentalBooking.update({
          where: { id: input.orderId },
          data: { claimToken: null },
        })
      : db.partOrder.update({
          where: { id: input.orderId },
          data: { claimToken: null },
        });
  await db.$transaction([
    db.user.update({
      where: { id: user.id },
      data: { passwordHash, isTempPassword: false },
    }),
    clearTokenOp,
  ]);

  const token = createToken({ userId: user.id, permissionRole: user.permissionRole });
  await setSessionCookie(token);
  return { ok: true, redirectTo: destinationFor(input.orderKind, user.permissionRole) };
}

export type LoginAndAttachResult =
  | { ok: true; redirectTo: string }
  | { ok: false; error: string };

export async function loginAndAttachOrder(input: {
  orderId: string;
  orderKind: OrderKind;
  claimToken: string;
  email: string;
  password: string;
}): Promise<LoginAndAttachResult> {
  if (!input.orderId || !input.claimToken || !input.email || !input.password) {
    return { ok: false, error: "Email и пароль обязательны" };
  }
  const inputEmail = input.email.trim().toLowerCase();

  let storedToken: string | null = null;
  let orderEmail: string | null = null;
  let orderUserId: string | null = null;
  if (input.orderKind === "booking") {
    const ro = (await db.repairOrder.findUnique({
      where: { id: input.orderId },
      select: {
        claimToken: true,
        userId: true,
        user: { select: { email: true } },
      },
    })) as
      | { claimToken: string | null; userId: string; user: { email: string } }
      | null;
    if (!ro) return { ok: false, error: "Неверная или истекшая ссылка claim" };
    storedToken = ro.claimToken;
    orderEmail = ro.user.email;
    orderUserId = ro.userId;
  } else if (input.orderKind === "rental") {
    const rb = (await db.rentalBooking.findUnique({
      where: { id: input.orderId },
      select: { claimToken: true, userId: true, contactEmail: true },
    })) as
      | { claimToken: string | null; userId: string | null; contactEmail: string }
      | null;
    if (!rb) return { ok: false, error: "Неверная или истекшая ссылка claim" };
    storedToken = rb.claimToken;
    orderEmail = rb.contactEmail;
    orderUserId = rb.userId;
  } else {
    const po = (await db.partOrder.findUnique({
      where: { id: input.orderId },
      select: { claimToken: true, userId: true, contactEmail: true },
    })) as
      | { claimToken: string | null; userId: string | null; contactEmail: string }
      | null;
    if (!po) return { ok: false, error: "Неверная или истекшая ссылка claim" };
    storedToken = po.claimToken;
    orderEmail = po.contactEmail;
    orderUserId = po.userId;
  }
  if (!tokensMatch(storedToken, input.claimToken)) {
    return { ok: false, error: "Неверная или истекшая ссылка claim" };
  }

  const user = (await db.user.findUnique({
    where: { email: inputEmail },
  })) as
    | {
        id: string;
        passwordHash: string | null;
        permissionRole: string;
        isTempPassword: boolean;
      }
    | null;
  if (!user || !user.passwordHash || user.permissionRole === "NONE") {
    return { ok: false, error: "Неверный email или пароль" };
  }
  if (user.isTempPassword) {
    return {
      ok: false,
      error: "Пароль не задан. Воспользуйтесь вкладкой «Создать пароль».",
    };
  }
  const valid = await bcrypt.compare(input.password, user.passwordHash);
  if (!valid) return { ok: false, error: "Неверный email или пароль" };

  if (orderEmail !== inputEmail) {
    return { ok: false, error: "Email не совпадает с заказом" };
  }

  // Decide attach/null-token operation up front so we can complete the DB
  // update before writing the session cookie. If anything throws here, no
  // cookie is set and the claimToken stays valid — fail-closed (SF1).
  if (input.orderKind === "cart") {
    if (orderUserId !== null && orderUserId !== user.id) {
      return { ok: false, error: "Заказ привязан к другому аккаунту." };
    }
    await db.partOrder.update({
      where: { id: input.orderId },
      data:
        orderUserId === null
          ? { userId: user.id, claimToken: null }
          : { claimToken: null },
    });
  } else if (input.orderKind === "rental") {
    if (orderUserId !== null && orderUserId !== user.id) {
      return { ok: false, error: "Заказ привязан к другому аккаунту." };
    }
    await db.rentalBooking.update({
      where: { id: input.orderId },
      data:
        orderUserId === null
          ? { userId: user.id, claimToken: null }
          : { claimToken: null },
    });
  } else {
    await db.repairOrder.update({
      where: { id: input.orderId },
      data: { claimToken: null },
    });
  }

  const token = createToken({ userId: user.id, permissionRole: user.permissionRole });
  await setSessionCookie(token);
  return { ok: true, redirectTo: destinationFor(input.orderKind, user.permissionRole) };
}
