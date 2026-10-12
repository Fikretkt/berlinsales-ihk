import { describe, it, expect } from "vitest";
import { hashToken, generateRawToken } from "./tokens";

describe("token helpers", () => {
  it("generateRawToken produziert URL-safe Base64", () => {
    const t = generateRawToken();
    expect(t.length).toBeGreaterThanOrEqual(40);
    expect(/^[A-Za-z0-9_-]+$/.test(t)).toBe(true);
  });

  it("zwei Tokens sind nicht gleich", () => {
    expect(generateRawToken()).not.toBe(generateRawToken());
  });

  it("hashToken ist deterministisch (gleicher Input → gleicher Hash)", () => {
    expect(hashToken("hello")).toBe(hashToken("hello"));
    expect(hashToken("hello")).not.toBe(hashToken("world"));
  });

  it("hashToken liefert 64-Zeichen-Hex (SHA-256)", () => {
    expect(hashToken("test")).toMatch(/^[a-f0-9]{64}$/);
  });
});
