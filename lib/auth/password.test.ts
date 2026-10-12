import { describe, it, expect } from "vitest";
import { hashPassword, verifyPassword } from "./password";

describe("password hashing", () => {
  it("hash und verify funktionieren round-trip", async () => {
    const hash = await hashPassword("test-password-12345");
    expect(hash).not.toBe("test-password-12345");
    expect(hash.startsWith("$2")).toBe(true);
    expect(await verifyPassword("test-password-12345", hash)).toBe(true);
    expect(await verifyPassword("falsch", hash)).toBe(false);
  });

  it("zwei identische Passwörter haben unterschiedliche Hashes (Salt)", async () => {
    const h1 = await hashPassword("gleiches-passwort");
    const h2 = await hashPassword("gleiches-passwort");
    expect(h1).not.toBe(h2);
    expect(await verifyPassword("gleiches-passwort", h1)).toBe(true);
    expect(await verifyPassword("gleiches-passwort", h2)).toBe(true);
  });
});
