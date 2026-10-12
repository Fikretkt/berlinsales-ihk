import { describe, expect, it } from "vitest";
import { marketCreateRequestSchema } from "./create-request";

describe("manual customer request validation", () => {
  const valid = { name: "Neue Firma", lat: 52.52, lng: 13.405 };

  it("accepts GPS-only customer creation without an external id or address", () => {
    expect(marketCreateRequestSchema.safeParse(valid).success).toBe(true);
  });

  it("rejects latitude and longitude outside their valid ranges", () => {
    expect(marketCreateRequestSchema.safeParse({ ...valid, lat: 91 }).success).toBe(false);
    expect(marketCreateRequestSchema.safeParse({ ...valid, lng: 181 }).success).toBe(false);
  });
});
