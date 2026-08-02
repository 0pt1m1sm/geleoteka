import { randomInt } from "node:crypto";

import bcrypt from "bcryptjs";

export const PASSWORD_RESET_TTL_MS = 15 * 60 * 1000;
export const PASSWORD_RESET_RESEND_COOLDOWN_MS = 60 * 1000;
export const PASSWORD_RESET_MAX_FAILED_ATTEMPTS = 5;

type QueryArgs = Record<string, unknown>;

interface PasswordResetRow {
  id: string;
  createdAt: Date;
  failedAttempts: number;
}

interface PasswordResetCandidate extends PasswordResetRow {
  codeVerifier: string;
}

export interface PasswordResetTx {
  passwordReset: {
    findFirst(args: QueryArgs): Promise<PasswordResetRow | null>;
    findMany(args: QueryArgs): Promise<PasswordResetCandidate[]>;
    updateMany(args: QueryArgs): Promise<{ count: number }>;
    create(args: QueryArgs): Promise<unknown>;
  };
  user: {
    update(args: QueryArgs): Promise<unknown>;
  };
}

export interface PasswordResetDb {
  $transaction<T>(
    fn: (tx: PasswordResetTx) => Promise<T>,
    options?: { isolationLevel: "Serializable" },
  ): Promise<T>;
}

export type IssuePasswordResetResult =
  | { status: "issued"; code: string; expiresAt: Date }
  | { status: "rate_limited"; retryAt: Date };

export interface IssuePasswordResetInput {
  userId: string;
  now?: Date;
}

/** Generate six SMS digits and persist only a cost-12 bcrypt verifier. */
export async function issuePasswordResetCode(
  client: PasswordResetDb,
  input: IssuePasswordResetInput,
): Promise<IssuePasswordResetResult> {
  if (!input.userId.trim()) throw new Error("Invalid password reset request");

  const now = input.now ?? new Date();
  const code = randomInt(100_000, 1_000_000).toString();
  const expiresAt = new Date(now.getTime() + PASSWORD_RESET_TTL_MS);
  const cooldownStartedAt = new Date(
    now.getTime() - PASSWORD_RESET_RESEND_COOLDOWN_MS,
  );

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await client.$transaction(async (tx) => {
        const recent = await tx.passwordReset.findFirst({
          where: {
            userId: input.userId,
            createdAt: { gt: cooldownStartedAt },
          },
          orderBy: { createdAt: "desc" },
          select: { id: true, createdAt: true, failedAttempts: true },
        });
        if (recent) {
          return {
            status: "rate_limited" as const,
            retryAt: new Date(
              recent.createdAt.getTime() + PASSWORD_RESET_RESEND_COOLDOWN_MS,
            ),
          };
        }

        const codeVerifier = await createPasswordResetCodeVerifier(code);

        // Only the newest SMS remains usable, so the attempt budget cannot be
        // multiplied by accumulating several live codes for one account.
        await tx.passwordReset.updateMany({
          where: { userId: input.userId, usedAt: null },
          data: { usedAt: now },
        });
        await tx.passwordReset.create({
          data: {
            userId: input.userId,
            codeVerifier,
            failedAttempts: 0,
            expiresAt,
            createdAt: now,
          },
        });

        return { status: "issued" as const, code, expiresAt };
      }, { isolationLevel: "Serializable" });
    } catch (error) {
      if (attempt < 2 && isSerializationFailure(error)) continue;
      throw error;
    }
  }

  throw new Error("Password reset transaction retry exhausted");
}

export type ConfirmPasswordResetResult =
  | { status: "confirmed"; usedAt: Date }
  | { status: "invalid" };

export interface ConfirmPasswordResetInput {
  userId: string;
  code: string;
  hashPassword: () => Promise<string>;
  now?: Date;
}

/**
 * Consume a valid code and change the password in one transaction.
 *
 * Every invalid submission atomically spends one of five attempts on the
 * newest live code. The fifth failure consumes that row. The successful path
 * uses updateMany as compare-and-swap, so concurrent confirmations cannot both
 * move the same unused, unexpired row to usedAt.
 */
export async function confirmPasswordResetCode(
  client: PasswordResetDb,
  input: ConfirmPasswordResetInput,
): Promise<ConfirmPasswordResetResult> {
  if (!input.userId.trim() || !input.code) {
    throw new Error("Invalid password reset confirmation");
  }

  const now = input.now ?? new Date();

  return client.$transaction(async (tx) => {
    const activeResets = await tx.passwordReset.findMany({
      where: {
        userId: input.userId,
        usedAt: null,
        expiresAt: { gt: now },
        failedAttempts: { lt: PASSWORD_RESET_MAX_FAILED_ATTEMPTS },
      },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        codeVerifier: true,
        createdAt: true,
        failedAttempts: true,
      },
    });

    let reset: PasswordResetCandidate | undefined;
    for (const candidate of activeResets) {
      if (await bcrypt.compare(input.code, candidate.codeVerifier)) {
        reset = candidate;
        break;
      }
    }

    if (!reset) {
      await recordFailedAttempt(tx, input.userId, now);
      return { status: "invalid" as const };
    }

    const consumed = await tx.passwordReset.updateMany({
      where: {
        id: reset.id,
        userId: input.userId,
        codeVerifier: reset.codeVerifier,
        usedAt: null,
        expiresAt: { gt: now },
        failedAttempts: { lt: PASSWORD_RESET_MAX_FAILED_ATTEMPTS },
      },
      data: { usedAt: now },
    });
    if (consumed.count !== 1) return { status: "invalid" as const };

    // Hash only after the code wins CAS. Invalid submissions therefore cannot
    // turn password hashing into an unbounded CPU endpoint, and a hash failure
    // rolls the token consumption back with the surrounding transaction.
    const passwordHash = await input.hashPassword();
    await tx.user.update({
      where: { id: input.userId },
      data: { passwordHash, isTempPassword: false },
    });

    return { status: "confirmed" as const, usedAt: now };
  });
}

export function createPasswordResetCodeVerifier(code: string): Promise<string> {
  return bcrypt.hash(code, 12);
}

async function recordFailedAttempt(
  tx: PasswordResetTx,
  userId: string,
  now: Date,
): Promise<void> {
  const active = await tx.passwordReset.findFirst({
    where: {
      userId,
      usedAt: null,
      expiresAt: { gt: now },
      failedAttempts: { lt: PASSWORD_RESET_MAX_FAILED_ATTEMPTS },
    },
    orderBy: { createdAt: "desc" },
    select: { id: true, createdAt: true, failedAttempts: true },
  });
  if (!active) return;

  const counted = await tx.passwordReset.updateMany({
    where: {
      id: active.id,
      usedAt: null,
      expiresAt: { gt: now },
      failedAttempts: { lt: PASSWORD_RESET_MAX_FAILED_ATTEMPTS - 1 },
    },
    data: { failedAttempts: { increment: 1 } },
  });
  if (counted.count === 1) return;

  // If another request spent the penultimate attempt first, this atomic
  // predicate lets exactly one request spend attempt five and consume the row.
  await tx.passwordReset.updateMany({
    where: {
      id: active.id,
      usedAt: null,
      expiresAt: { gt: now },
      failedAttempts: {
        gte: PASSWORD_RESET_MAX_FAILED_ATTEMPTS - 1,
        lt: PASSWORD_RESET_MAX_FAILED_ATTEMPTS,
      },
    },
    data: { failedAttempts: { increment: 1 }, usedAt: now },
  });
}

function isSerializationFailure(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "P2034"
  );
}
