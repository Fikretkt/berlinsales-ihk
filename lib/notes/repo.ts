// Notes-Repository: Liste pro Markt, Anlegen, Editieren (innerhalb editable_until).

import { sql, eq, desc, and } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { market as marketTable, note as noteTable, user as userTable } from "@/lib/db/schema";
import { HttpError, type SessionUser } from "@/lib/http/errors";
import { getMarketDetail } from "@/lib/markets/repo";

export interface NoteItem {
  id: string;
  marketId: string;
  content: string;
  userId: string;
  userName: string;
  createdAt: Date;
  editableUntil: Date;
  isEditable: boolean;
}

export async function listNotesForMarket(
  marketId: string,
  user: SessionUser,
): Promise<NoteItem[]> {
  const market = await getMarketDetail(user.companyId, marketId);
  if (market.kind !== "ok") throw new HttpError(404, "MARKET_NOT_FOUND", "Markt nicht gefunden");
  const rows = await db
    .select({
      id: noteTable.id,
      marketId: noteTable.marketId,
      content: noteTable.content,
      userId: noteTable.userId,
      userName: userTable.name,
      createdAt: noteTable.createdAt,
      editableUntil: noteTable.editableUntil,
    })
    .from(noteTable)
    .innerJoin(userTable, eq(userTable.id, noteTable.userId))
    .where(eq(noteTable.marketId, marketId))
    .orderBy(desc(noteTable.createdAt))
    .limit(100);

  const now = new Date();
  return rows.map((r) => ({
    id: r.id,
    marketId: r.marketId,
    content: r.content,
    userId: r.userId,
    userName: r.userName,
    createdAt: r.createdAt,
    editableUntil: r.editableUntil,
    // Nur die eigene Notiz innerhalb des Editierfensters ist editierbar
    isEditable: r.userId === user.id && r.editableUntil > now,
  }));
}

export async function createNote(
  marketId: string,
  content: string,
  user: SessionUser,
): Promise<NoteItem> {
  const market = await getMarketDetail(user.companyId, marketId);
  if (market.kind !== "ok") throw new HttpError(404, "MARKET_NOT_FOUND", "Markt nicht gefunden");
  if (content.trim().length === 0) {
    throw new HttpError(400, "VALIDATION_FAILED", "Notiz darf nicht leer sein");
  }
  if (content.length > 5000) {
    throw new HttpError(400, "VALIDATION_FAILED", "Notiz ist zu lang (max 5000 Zeichen)");
  }
  const res = await db
    .insert(noteTable)
    .values({
      marketId,
      userId: user.id,
      content: content.trim(),
    })
    .returning({
      id: noteTable.id,
      createdAt: noteTable.createdAt,
      editableUntil: noteTable.editableUntil,
    });
  return {
    id: res[0]!.id,
    marketId,
    content: content.trim(),
    userId: user.id,
    userName: user.name,
    createdAt: res[0]!.createdAt,
    editableUntil: res[0]!.editableUntil,
    isEditable: true,
  };
}

export async function updateNote(
  noteId: string,
  newContent: string,
  user: SessionUser,
): Promise<void> {
  if (newContent.trim().length === 0) {
    throw new HttpError(400, "VALIDATION_FAILED", "Notiz darf nicht leer sein");
  }
  const rows = await db
    .select({
      id: noteTable.id,
      userId: noteTable.userId,
      editableUntil: noteTable.editableUntil,
    })
    .from(noteTable)
    .innerJoin(marketTable, eq(noteTable.marketId, marketTable.id))
    .where(and(eq(noteTable.id, noteId), eq(marketTable.companyId, user.companyId)))
    .limit(1);
  if (rows.length === 0) {
    throw new HttpError(404, "NOTE_NOT_FOUND", "Notiz nicht gefunden");
  }
  const n = rows[0]!;
  if (n.userId !== user.id) {
    throw new HttpError(403, "FORBIDDEN", "Du kannst nur deine eigenen Notizen bearbeiten");
  }
  if (n.editableUntil <= new Date()) {
    throw new HttpError(
      403,
      "NOTE_EDIT_WINDOW_CLOSED",
      "Notizen sind nur innerhalb von 24 Stunden editierbar",
    );
  }
  await db
    .update(noteTable)
    .set({ content: newContent.trim() })
    .where(and(eq(noteTable.id, noteId), eq(noteTable.userId, user.id)));
}

void sql;
