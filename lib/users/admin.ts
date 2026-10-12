// Admin-User-Verwaltung: Liste, Einladung, Updates.

import { and, sql, eq, desc } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { user as userTable, company as companyTable, auditLog } from "@/lib/db/schema";
import { createToken } from "@/lib/auth/tokens";
import { sendMail } from "@/lib/email/send";
import { setupInvitation } from "@/lib/email/templates";
import { AUDIT_EVENTS } from "@/lib/audit/events";
import { HttpError, type SessionUser } from "@/lib/http/errors";
import type { UserRole } from "@/lib/db/schema";

export interface AdminUserListItem {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  active: boolean;
  hasPassword: boolean; // false = noch nicht aktiviert
  lastLoginAt: Date | null;
  createdAt: Date;
  companyId: string;
  companyName: string;
}

export async function listUsers(admin: SessionUser): Promise<AdminUserListItem[]> {
  const rows = await db
    .select({
      id: userTable.id,
      email: userTable.email,
      name: userTable.name,
      role: userTable.role,
      active: userTable.active,
      passwordHash: userTable.passwordHash,
      lastLoginAt: userTable.lastLoginAt,
      createdAt: userTable.createdAt,
      companyId: userTable.companyId,
      companyName: companyTable.name,
    })
    .from(userTable)
    .innerJoin(companyTable, eq(companyTable.id, userTable.companyId))
    .where(eq(userTable.companyId, admin.companyId))
    .orderBy(desc(userTable.createdAt));
  return rows.map((r) => ({
    id: r.id,
    email: r.email,
    name: r.name,
    role: r.role,
    active: r.active,
    hasPassword: !!r.passwordHash,
    lastLoginAt: r.lastLoginAt,
    createdAt: r.createdAt,
    companyId: r.companyId,
    companyName: r.companyName,
  }));
}

export async function listCompanies(admin: SessionUser) {
  return db
    .select({ id: companyTable.id, name: companyTable.name })
    .from(companyTable)
    .where(eq(companyTable.id, admin.companyId))
    .orderBy(companyTable.name);
}

export interface InviteUserInput {
  email: string;
  name: string;
  role: UserRole;
}

export async function inviteUser(
  input: InviteUserInput,
  inviter: SessionUser,
): Promise<{ userId: string; emailSent: boolean; emailError?: string }> {
  // Email darf noch nicht existieren
  const existing = await db
    .select({ id: userTable.id })
    .from(userTable)
    .where(eq(userTable.email, input.email.toLowerCase()))
    .limit(1);
  if (existing.length > 0) {
    throw new HttpError(409, "USER_EXISTS", "Diese E-Mail ist schon vergeben");
  }

  const newUserId = await db.transaction(async (tx) => {
    const res = await tx
      .insert(userTable)
      .values({
        email: input.email.toLowerCase(),
        name: input.name,
        role: input.role,
        companyId: inviter.companyId,
        active: true,
        passwordHash: null, // wird beim Setup gesetzt
      })
      .returning({ id: userTable.id });
    return res[0]!.id;
  });

  const { rawToken } = await createToken(db, newUserId, "setup");
  const baseUrl = process.env.AUTH_URL ?? "http://localhost:3000";
  const setupUrl = `${baseUrl}/auth/setup?token=${encodeURIComponent(rawToken)}`;
  const tpl = setupInvitation({
    appUrl: baseUrl,
    recipientName: input.name,
    setupUrl,
  });
  const mailRes = await sendMail({ to: input.email, ...tpl });

  await db.insert(auditLog).values({
    companyId: inviter.companyId,
    userId: inviter.id,
    event: mailRes.ok
      ? AUDIT_EVENTS.USER_INVITED
      : AUDIT_EVENTS.USER_INVITED_EMAIL_FAILED,
    payload: {
      invited_user_id: newUserId,
      email: input.email,
      ...(mailRes.ok ? {} : { error: mailRes.error }),
    },
  });

  return {
    userId: newUserId,
    emailSent: mailRes.ok,
    emailError: mailRes.ok ? undefined : mailRes.error,
  };
}

export interface UpdateUserInput {
  role?: UserRole;
  active?: boolean;
  name?: string;
}

export async function updateUser(
  id: string,
  input: UpdateUserInput,
  admin: SessionUser,
): Promise<void> {
  const existing = await db
    .select({
      id: userTable.id,
      role: userTable.role,
      active: userTable.active,
      companyId: userTable.companyId,
    })
    .from(userTable)
    .where(and(eq(userTable.id, id), eq(userTable.companyId, admin.companyId)))
    .limit(1);
  if (existing.length === 0) {
    throw new HttpError(404, "USER_NOT_FOUND", "Benutzer nicht gefunden");
  }
  const before = existing[0]!;

  const updates: Record<string, unknown> = {};
  if (input.role !== undefined) updates.role = input.role;
  if (input.active !== undefined) updates.active = input.active;
  if (input.name !== undefined) updates.name = input.name;

  if (Object.keys(updates).length === 0) return;

  await db.transaction(async (tx) => {
    await tx
      .update(userTable)
      .set(updates)
      .where(and(eq(userTable.id, id), eq(userTable.companyId, admin.companyId)));
    if (input.role !== undefined && input.role !== before.role) {
      await tx.insert(auditLog).values({
        companyId: admin.companyId,
        userId: admin.id,
        event: AUDIT_EVENTS.USER_ROLE_CHANGED,
        payload: { user_id: id, before: before.role, after: input.role },
      });
    }
    if (input.active !== undefined && input.active !== before.active) {
      await tx.insert(auditLog).values({
        companyId: admin.companyId,
        userId: admin.id,
        event: input.active
          ? AUDIT_EVENTS.USER_ACTIVATED
          : AUDIT_EVENTS.USER_DEACTIVATED,
        payload: { user_id: id },
      });
    }
  });
}

export async function resendInvitation(
  id: string,
  inviter: SessionUser,
): Promise<{ emailSent: boolean; emailError?: string }> {
  const rows = await db
    .select({
      id: userTable.id,
      email: userTable.email,
      name: userTable.name,
      passwordHash: userTable.passwordHash,
      companyId: userTable.companyId,
    })
    .from(userTable)
    .where(and(eq(userTable.id, id), eq(userTable.companyId, inviter.companyId)))
    .limit(1);
  if (rows.length === 0)
    throw new HttpError(404, "USER_NOT_FOUND", "Benutzer nicht gefunden");
  const u = rows[0]!;
  if (u.passwordHash) {
    throw new HttpError(
      409,
      "USER_ALREADY_ACTIVATED",
      "Dieser Benutzer hat schon ein Passwort gesetzt",
    );
  }

  // Alte Setup-Tokens invalidieren
  await db.execute(sql`
    UPDATE password_reset_token
    SET consumed_at = NOW()
    WHERE user_id = ${id}::uuid AND purpose = 'setup' AND consumed_at IS NULL
  `);

  const { rawToken } = await createToken(db, id, "setup");
  const baseUrl = process.env.AUTH_URL ?? "http://localhost:3000";
  const setupUrl = `${baseUrl}/auth/setup?token=${encodeURIComponent(rawToken)}`;
  const tpl = setupInvitation({
    appUrl: baseUrl,
    recipientName: u.name,
    setupUrl,
  });
  const mailRes = await sendMail({ to: u.email, ...tpl });

  await db.insert(auditLog).values({
    companyId: inviter.companyId,
    userId: inviter.id,
    event: AUDIT_EVENTS.USER_INVITATION_RESENT,
    payload: {
      user_id: id,
      email: u.email,
      mail_ok: mailRes.ok,
      ...(mailRes.ok ? {} : { error: mailRes.error }),
    },
  });

  return { emailSent: mailRes.ok, emailError: mailRes.ok ? undefined : mailRes.error };
}
