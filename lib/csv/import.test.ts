import { describe, expect, it } from "vitest";
import { normalizeDecimal } from "./import";

describe("Google Places coordinate normalization", () => {
  it("normalizes decimal commas on individual parsed fields", () => {
    expect(normalizeDecimal("52,5252137")).toBe(52.5252137);
    expect(normalizeDecimal("13,4061021")).toBe(13.4061021);
  });

  it("marks missing and nonnumeric coordinates as invalid", () => {
    expect(Number.isNaN(normalizeDecimal(undefined))).toBe(true);
    expect(Number.isNaN(normalizeDecimal("not-a-coordinate"))).toBe(true);
  });
});
