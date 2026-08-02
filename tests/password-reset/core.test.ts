import bcrypt from "bcryptjs";
import { describe, expect, it } from "vitest";

import {
  PASSWORD_RESET_MAX_FAILED_ATTEMPTS,
  PASSWORD_RESET_TTL_MS,
  confirmPasswordResetCode,
  issuePasswordResetCode,
  type PasswordResetDb,
  type PasswordResetTx,
} from "@/lib/password-reset/core";

const NOW = new Date("2026-08-01T12:00:00.000Z");
const CONFIRMED_AT = new Date(NOW.getTime() + 60_000);
const ORIGINAL_PASSWORD_HASH = "old-password-hash";
const NEW_PASSWORD_HASH = "new-password-hash";

interface ResetRow {
  id: string;
  userId: string;
  codeVerifier: string;
  failedAttempts: number;
  expiresAt: Date;
  usedAt: Date | null;
  createdAt: Date;
}

interface UserRow {
  id: string;
  passwordHash: string;
  isTempPassword: boolean;
}

interface ResetWhere {
  id?: string;
  userId?: string;
  codeVerifier?: string;
  usedAt?: null;
  createdAt?: { gt: Date };
  expiresAt?: { gt: Date };
  failedAttempts?: { gte?: number; lt?: number };
}

function createBarrier(participantCount: number): () => Promise<void> {
  let arrivals = 0;
  let release = () => {};
  const allArrived = new Promise<void>((resolve) => {
    release = resolve;
  });

  return async () => {
    arrivals += 1;
    if (arrivals === participantCount) release();
    await allArrived;
  };
}

class FakePasswordResetDb implements PasswordResetDb {
  readonly resets: ResetRow[] = [];
  readonly users = new Map<string, UserRow>();
  passwordWrites = 0;
  private nextId = 1;

  constructor(
    private readonly beforeConfirmationCompareAndSwap?: () => Promise<void>,
  ) {
    this.users.set("user_1", {
      id: "user_1",
      passwordHash: ORIGINAL_PASSWORD_HASH,
      isTempPassword: true,
    });
  }

  async $transaction<T>(
    fn: (tx: PasswordResetTx) => Promise<T>,
  ): Promise<T> {
    const tx: PasswordResetTx = {
      passwordReset: {
        findFirst: async (args: Record<string, unknown>) => {
          const where = args.where as ResetWhere;
          const found = this.resets
            .filter((row) => this.matches(row, where))
            .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];
          return found
            ? {
                id: found.id,
                createdAt: found.createdAt,
                failedAttempts: found.failedAttempts,
              }
            : null;
        },
        findMany: async (args: Record<string, unknown>) => {
          const where = args.where as ResetWhere;
          return this.resets
            .filter((row) => this.matches(row, where))
            .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
            .map((row) => ({
              id: row.id,
              codeVerifier: row.codeVerifier,
              createdAt: row.createdAt,
              failedAttempts: row.failedAttempts,
            }));
        },
        updateMany: async (args: Record<string, unknown>) => {
          const where = args.where as ResetWhere;
          const data = args.data as {
            usedAt?: Date;
            failedAttempts?: number | { increment: number };
          };

          if (where.codeVerifier !== undefined && data.usedAt !== undefined) {
            await this.beforeConfirmationCompareAndSwap?.();
          }

          let count = 0;
          for (const row of this.resets) {
            if (!this.matches(row, where)) continue;
            if (data.usedAt !== undefined) row.usedAt = data.usedAt;
            if (typeof data.failedAttempts === "number") {
              row.failedAttempts = data.failedAttempts;
            } else if (data.failedAttempts) {
              row.failedAttempts += data.failedAttempts.increment;
            }
            count += 1;
          }
          return { count };
        },
        create: async (args: Record<string, unknown>) => {
          const data = args.data as Omit<ResetRow, "id" | "usedAt">;
          const row: ResetRow = {
            ...data,
            id: `reset_${this.nextId++}`,
            usedAt: null,
          };
          this.resets.push(row);
          return row;
        },
      },
      user: {
        update: async (args: Record<string, unknown>) => {
          const where = args.where as { id: string };
          const data = args.data as {
            passwordHash: string;
            isTempPassword: boolean;
          };
          const user = this.users.get(where.id);
          if (!user) throw new Error("User not found");
          user.passwordHash = data.passwordHash;
          user.isTempPassword = data.isTempPassword;
          this.passwordWrites += 1;
          return user;
        },
      },
    };

    return fn(tx);
  }

  private matches(row: ResetRow, where: ResetWhere): boolean {
    return (
      (where.id === undefined || row.id === where.id) &&
      (where.userId === undefined || row.userId === where.userId) &&
      (where.codeVerifier === undefined ||
        row.codeVerifier === where.codeVerifier) &&
      (where.usedAt === undefined || row.usedAt === where.usedAt) &&
      (where.createdAt === undefined || row.createdAt > where.createdAt.gt) &&
      (where.expiresAt === undefined || row.expiresAt > where.expiresAt.gt) &&
      (where.failedAttempts?.gte === undefined ||
        row.failedAttempts >= where.failedAttempts.gte) &&
      (where.failedAttempts?.lt === undefined ||
        row.failedAttempts < where.failedAttempts.lt)
    );
  }
}

async function issue(fake: FakePasswordResetDb): Promise<string> {
  const result = await issuePasswordResetCode(fake, {
    userId: "user_1",
    now: NOW,
  });
  expect(result.status).toBe("issued");
  if (result.status !== "issued") throw new Error("Expected issued code");
  return result.code;
}

async function confirm(
  fake: FakePasswordResetDb,
  code: string,
  now = CONFIRMED_AT,
) {
  return confirmPasswordResetCode(fake, {
    userId: "user_1",
    code,
    hashPassword: async () => NEW_PASSWORD_HASH,
    now,
  });
}

describe("password reset codes", () => {
  it("changes the password and consumes a valid code", async () => {
    const fake = new FakePasswordResetDb();
    const code = await issue(fake);

    await expect(confirm(fake, code)).resolves.toEqual({
      status: "confirmed",
      usedAt: CONFIRMED_AT,
    });
    expect(fake.resets[0]?.usedAt).toEqual(CONFIRMED_AT);
    expect(fake.users.get("user_1")).toEqual({
      id: "user_1",
      passwordHash: NEW_PASSWORD_HASH,
      isTempPassword: false,
    });
  });

  it("rejects reuse of the same code", async () => {
    const fake = new FakePasswordResetDb();
    const code = await issue(fake);
    await confirm(fake, code);

    await expect(confirm(fake, code)).resolves.toEqual({ status: "invalid" });
    expect(fake.passwordWrites).toBe(1);
  });

  it("rejects an expired code", async () => {
    const fake = new FakePasswordResetDb();
    const code = await issue(fake);

    await expect(
      confirm(fake, code, new Date(NOW.getTime() + PASSWORD_RESET_TTL_MS + 1)),
    ).resolves.toEqual({ status: "invalid" });
    expect(fake.resets[0]?.usedAt).toBeNull();
    expect(fake.users.get("user_1")?.passwordHash).toBe(ORIGINAL_PASSWORD_HASH);
  });

  it("persists only a bcrypt verifier, never the SMS code", async () => {
    const fake = new FakePasswordResetDb();
    const code = await issue(fake);
    const row = fake.resets[0];

    expect(code).toMatch(/^\d{6}$/);
    expect(row?.codeVerifier).toMatch(/^\$2/);
    expect(row?.codeVerifier).toHaveLength(60);
    await expect(bcrypt.compare(code, row?.codeVerifier ?? "")).resolves.toBe(
      true,
    );
    expect(row).not.toHaveProperty("code");
    expect(Object.values(row ?? {})).not.toContain(code);
  });

  it("keeps the valid code unusable after five failed attempts", async () => {
    const fake = new FakePasswordResetDb();
    const code = await issue(fake);

    for (let attempt = 0; attempt < PASSWORD_RESET_MAX_FAILED_ATTEMPTS; attempt += 1) {
      await expect(confirm(fake, "000000")).resolves.toEqual({ status: "invalid" });
    }

    expect(fake.resets[0]?.failedAttempts).toBe(
      PASSWORD_RESET_MAX_FAILED_ATTEMPTS,
    );
    expect(fake.resets[0]?.usedAt).toEqual(CONFIRMED_AT);
    await expect(confirm(fake, code)).resolves.toEqual({ status: "invalid" });
    expect(fake.users.get("user_1")?.passwordHash).toBe(ORIGINAL_PASSWORD_HASH);
    expect(fake.passwordWrites).toBe(0);
  });

  it("allows exactly one winner when two confirmations race", async () => {
    const fake = new FakePasswordResetDb(createBarrier(2));
    const code = await issue(fake);

    const results = await Promise.all([confirm(fake, code), confirm(fake, code)]);

    expect(results.map((result) => result.status).sort()).toEqual([
      "confirmed",
      "invalid",
    ]);
    expect(fake.passwordWrites).toBe(1);
    expect(fake.resets[0]?.usedAt).toEqual(CONFIRMED_AT);
  });
});
