import { createHash, randomBytes } from "node:crypto";

import { TENANT_KEY } from "@/lib/tenant";

export const EMAIL_VERIFICATION_TOKEN_BYTES = 32;
export const EMAIL_VERIFICATION_TTL_MS = 24 * 60 * 60 * 1000;
export const EMAIL_VERIFICATION_RESEND_COOLDOWN_MS = 5 * 60 * 1000;

type QueryArgs = Record<string, unknown>;

export interface EmailVerificationTx {
  emailVerificationToken: {
    findFirst(args: QueryArgs): Promise<{ createdAt: Date } | null>;
    findUnique(
      args: QueryArgs,
    ): Promise<{
      id: string;
      userId: string;
      email: string;
      expiresAt: Date;
      usedAt: Date | null;
    } | null>;
    updateMany(args: QueryArgs): Promise<{ count: number }>;
    create(args: QueryArgs): Promise<unknown>;
  };
  user: {
    updateMany(args: QueryArgs): Promise<{ count: number }>;
  };
}

export interface EmailVerificationDb {
  $transaction<T>(
    fn: (tx: EmailVerificationTx) => Promise<T>,
    options?: { isolationLevel: "Serializable" },
  ): Promise<T>;
}

export type IssueEmailVerificationResult =
  | {
      status: "issued";
      verificationUrl: string;
      expiresAt: Date;
    }
  | {
      status: "rate_limited";
      retryAt: Date;
    };

export interface IssueEmailVerificationInput {
  userId: string;
  email: string;
  appUrl: string;
  now?: Date;
}

/**
 * Issue a 256-bit token while persisting only its SHA-256 digest.
 *
 * SERIALIZABLE makes the rolling per-user cooldown safe under concurrent
 * resend requests. A serialization retry re-runs the recent-token read, so
 * only the transaction that committed first can issue an email.
 */
export async function issueEmailVerificationToken(
  client: EmailVerificationDb,
  input: IssueEmailVerificationInput,
): Promise<IssueEmailVerificationResult> {
  const now = input.now ?? new Date();
  const email = input.email.trim().toLowerCase();
  if (!input.userId.trim() || !email || !input.appUrl.trim()) {
    throw new Error("Invalid email verification request");
  }

  const rawToken = randomBytes(EMAIL_VERIFICATION_TOKEN_BYTES).toString("base64url");
  const tokenHash = hashEmailVerificationToken(rawToken);
  const expiresAt = new Date(now.getTime() + EMAIL_VERIFICATION_TTL_MS);
  const cooldownStartedAt = new Date(
    now.getTime() - EMAIL_VERIFICATION_RESEND_COOLDOWN_MS,
  );

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const result = await client.$transaction(async (tx) => {
        const recent = await tx.emailVerificationToken.findFirst({
          where: {
            tenantKey: TENANT_KEY,
            userId: input.userId,
            createdAt: { gt: cooldownStartedAt },
          },
          orderBy: { createdAt: "desc" },
          select: { createdAt: true },
        });
        if (recent) {
          return {
            status: "rate_limited" as const,
            retryAt: new Date(
              recent.createdAt.getTime() +
                EMAIL_VERIFICATION_RESEND_COOLDOWN_MS,
            ),
          };
        }

        // A new link replaces every older outstanding link for this user.
        await tx.emailVerificationToken.updateMany({
          where: {
            tenantKey: TENANT_KEY,
            userId: input.userId,
            usedAt: null,
          },
          data: { usedAt: now },
        });
        await tx.emailVerificationToken.create({
          data: {
            tenantKey: TENANT_KEY,
            userId: input.userId,
            email,
            tokenHash,
            expiresAt,
            createdAt: now,
          },
        });

        const url = new URL("/verify-email", input.appUrl);
        url.searchParams.set("token", rawToken);
        return {
          status: "issued" as const,
          verificationUrl: url.toString(),
          expiresAt,
        };
      }, { isolationLevel: "Serializable" });
      return result;
    } catch (error) {
      if (attempt < 2 && isSerializationFailure(error)) continue;
      throw error;
    }
  }

  throw new Error("Email verification transaction retry exhausted");
}

export type ConfirmEmailVerificationResult =
  | { status: "confirmed"; verifiedAt: Date }
  | { status: "invalid" };

/**
 * Consume a token and verify the exact email snapshot in one transaction.
 * updateMany is the compare-and-swap: only an unexpired, unused row can move
 * to usedAt. Concurrent visits therefore cannot both confirm.
 */
export async function confirmEmailVerificationToken(
  client: EmailVerificationDb,
  rawToken: string,
  now = new Date(),
): Promise<ConfirmEmailVerificationResult> {
  if (!isWellFormedRawToken(rawToken)) return { status: "invalid" };
  const tokenHash = hashEmailVerificationToken(rawToken);

  try {
    return await client.$transaction(async (tx) => {
      const token = await tx.emailVerificationToken.findUnique({
        where: {
          tenantKey_tokenHash: {
            tenantKey: TENANT_KEY,
            tokenHash,
          },
        },
        select: {
          id: true,
          userId: true,
          email: true,
          expiresAt: true,
          usedAt: true,
        },
      });

      // One deliberately generic result covers absent, cross-tenant, expired,
      // and previously used links.
      if (!token || token.usedAt || token.expiresAt <= now) {
        return { status: "invalid" as const };
      }

      const consumed = await tx.emailVerificationToken.updateMany({
        where: {
          id: token.id,
          tenantKey: TENANT_KEY,
          tokenHash,
          usedAt: null,
          expiresAt: { gt: now },
        },
        data: { usedAt: now },
      });
      if (consumed.count !== 1) return { status: "invalid" as const };

      const verified = await tx.user.updateMany({
        where: {
          id: token.userId,
          email: token.email,
          emailVerifiedAt: null,
        },
        data: { emailVerifiedAt: now },
      });
      if (verified.count !== 1) {
        // Roll back usedAt as well: a link for an old address must not mutate
        // the token independently of the User verification state.
        throw new VerificationTargetChangedError();
      }

      return { status: "confirmed" as const, verifiedAt: now };
    });
  } catch (error) {
    if (error instanceof VerificationTargetChangedError) {
      return { status: "invalid" };
    }
    throw error;
  }
}

export function hashEmailVerificationToken(rawToken: string): string {
  return createHash("sha256").update(rawToken, "utf8").digest("hex");
}

/** Preserve verification for a no-op/casing-only save; reset it for a new address. */
export function resetEmailVerificationOnChange(
  currentEmail: string,
  nextEmail: string,
): { emailVerifiedAt: null } | Record<string, never> {
  const normalize = (value: string) => value.trim().toLowerCase();
  return normalize(currentEmail) === normalize(nextEmail)
    ? {}
    : { emailVerifiedAt: null };
}

function isWellFormedRawToken(rawToken: string): boolean {
  return /^[A-Za-z0-9_-]{43}$/.test(rawToken);
}

function isSerializationFailure(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "P2034"
  );
}

class VerificationTargetChangedError extends Error {
  constructor() {
    super("Email verification target changed");
    this.name = "VerificationTargetChangedError";
  }
}
