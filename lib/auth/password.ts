// Passwort-Hashing via bcryptjs (pure-JS, kein nativer Build nötig).
// Lastenheft 5.4: bcryptjs als Hashing-Lib. Cost-Factor 12 (Default 10 ist zu schwach).

import bcrypt from "bcryptjs";

const COST = 12;

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, COST);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

// Mindestlänge wird in der Zod-Schema enforced. Hier nur Konvention.
export const MIN_PASSWORD_LENGTH = 10;
