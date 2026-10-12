import { describe, it, expect } from "vitest";
import { haversineMeters } from "./distance";

describe("haversineMeters", () => {
  it("Brandenburger Tor → Reichstag (~330m)", () => {
    const d = haversineMeters(52.5163, 13.3777, 52.5186, 13.3761);
    expect(d).toBeGreaterThan(250);
    expect(d).toBeLessThan(400);
  });

  it("identische Koordinaten → 0", () => {
    expect(haversineMeters(52.52, 13.4, 52.52, 13.4)).toBe(0);
  });

  it("Berlin → Potsdam (~26 km)", () => {
    const d = haversineMeters(52.52, 13.4, 52.3906, 13.0645);
    expect(d).toBeGreaterThan(24_000);
    expect(d).toBeLessThan(28_000);
  });
});
