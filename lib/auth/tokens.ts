// Setup- und Reset-Token-Lifecycle.
// Token im Klartext nur in der E-Mail / im URL-Param.
// In der DB liegt nur SHA-256-Hash → bei DB-Leak sind Tokens nicht direkt verwendbar.
//
// TTLs (Lastenheft 5.4 + Reference.md):
//   setup → 7 Tage
//   reset → 1 Stunde
//
// Idempotenz: consume() setzt consumed_at, danach ist der Token einmalig verwertet.

import { randomBytes, createHash } from "node:crypto";
import { and, eq, gt, isNull, sql } from "drizzle-orm";
import { addDays, addHours } from "date-fns";
import { passwordResetToken } from "@/lib/db/schema";
import type { DbClient } from "@/lib/db/client";

export type TokenPurpose = "setup" | "reset";

const TTL_BY_PURPOSE: Record<TokenPurpose, () => Date> = {
  setup: () => addDays(new Date(), 7),
  reset: () => addHours(new Date(), 1),
};

export function hashToken(plain: string): string {
  return createHash("sha256").update(plain).digest("hex");
}

export function generateRawToken(): string {
  // 32 Bytes = 256 Bit Entropie, URL-safe base64 → 43 Zeichen
  return randomBytes(32).toString("base64url");
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DbLike = DbClient | any;

export async function createToken(
  db: DbLike,
  userId: string,
  purpose: TokenPurpose,
): Promise<{ rawToken: string; expiresAt: Date }> {
  const rawToken = generateRawToken();
  const tokenHash = hashToken(rawToken);
  const expiresAt = TTL_BY_PURPOSE[purpose]();
  await db.insert(passwordResetToken).values({
    userId,
    tokenHash,
    purpose,
    expiresAt,
  });
  return { rawToken, expiresAt };
}

export interface VerifiedToken {
  id: string;
  userId: string;
  purpose: TokenPurpose;
}

export async function verifyToken(
  db: DbLike,
  rawToken: string,
  purpose: TokenPurpose,
): Promise<VerifiedToken | null> {
  const tokenHash = hashToken(rawToken);
  const row = await db.query.passwordResetToken.findFirst({
    where: and(
      eq(passwordResetToken.tokenHash, tokenHash),
      eq(passwordResetToken.purpose, purpose),
      isNull(passwordResetToken.consumedAt),
      gt(passwordResetToken.expiresAt, sql`NOW()`),
    ),
  });
  if (!row) return null;
  return { id: row.id, userId: row.userId, purpose: row.purpose as TokenPurpose };
}

export async function consumeToken(db: DbLike, tokenId: string): Promise<void> {
  await db
    .update(passwordResetToken)
    .set({ consumedAt: sql`NOW()` })
    .where(eq(passwordResetToken.id, tokenId));
}

// Anti-Enumeration für Reset: Alle aktiven Tokens eines Users verbrennen,
// bevor ein neuer ausgestellt wird.
export async function invalidateActiveTokens(
  db: DbLike,
  userId: string,
  purpose: TokenPurpose,
): Promise<void> {
  await db
    .update(passwordResetToken)
    .set({ consumedAt: sql`NOW()` })
    .where(
      and(
        eq(passwordResetToken.userId, userId),
        eq(passwordResetToken.purpose, purpose),
        isNull(passwordResetToken.consumedAt),
      ),
    );
}
