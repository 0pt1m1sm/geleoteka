import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  __resetLoginThrottle,
  registerFailedLogin,
  clearLoginFailures,
  isLoginBlocked,
  LOGIN_MAX_FAILURES,
  LOGIN_WINDOW_MS,
} from "@/lib/login-rate-limit";

beforeEach(() => __resetLoginThrottle());

describe("login rate limit — sliding window per identifier", () => {
  it("allows attempts below the threshold", () => {
    const key = "user@test.ru";
    for (let i = 0; i < LOGIN_MAX_FAILURES - 1; i += 1) {
      registerFailedLogin(key, 1000 + i);
    }
    expect(isLoginBlocked(key, 1000 + LOGIN_MAX_FAILURES)).toBe(false);
  });

  it("blocks once failures reach the threshold within the window", () => {
    const key = "user@test.ru";
    for (let i = 0; i < LOGIN_MAX_FAILURES; i += 1) {
      registerFailedLogin(key, 1000 + i);
    }
    expect(isLoginBlocked(key, 1000 + LOGIN_MAX_FAILURES)).toBe(true);
  });

  it("expires old failures outside the window", () => {
    const key = "user@test.ru";
    for (let i = 0; i < LOGIN_MAX_FAILURES; i += 1) {
      registerFailedLogin(key, 1000 + i);
    }
    // далеко за окном — старые провалы больше не считаются
    expect(isLoginBlocked(key, 1000 + LOGIN_WINDOW_MS + 1)).toBe(false);
  });

  it("a successful login clears the counter", () => {
    const key = "user@test.ru";
    for (let i = 0; i < LOGIN_MAX_FAILURES; i += 1) {
      registerFailedLogin(key, 1000 + i);
    }
    clearLoginFailures(key);
    expect(isLoginBlocked(key, 1000 + LOGIN_MAX_FAILURES)).toBe(false);
  });

  it("isolates identifiers from each other", () => {
    for (let i = 0; i < LOGIN_MAX_FAILURES; i += 1) registerFailedLogin("a@test.ru", 1000 + i);
    expect(isLoginBlocked("a@test.ru", 2000)).toBe(true);
    expect(isLoginBlocked("b@test.ru", 2000)).toBe(false);
  });

  it("normalizes the key (case/whitespace) so bypass by casing fails", () => {
    for (let i = 0; i < LOGIN_MAX_FAILURES; i += 1) registerFailedLogin("  User@Test.RU ", 1000 + i);
    expect(isLoginBlocked("user@test.ru", 2000)).toBe(true);
  });
});
