import { describe, expect, it } from "vitest";
import { hostBereich } from "./dbAuswahl";
import { hostDbAuswahl } from "./dbAuswahl";
import { ersteDb, zweiteDb } from "./client";

describe("hostBereich", () => {
  it("internal host için internal döndürür", () => {
    process.env.APP_HOST_INTERNAL = "internal.localhost";
    process.env.APP_HOST_EXTERNAL = "external.localhost";

    expect(hostBereich("internal.localhost")).toBe("internal");
  });

  it("external host için external döndürür", () => {
    process.env.APP_HOST_INTERNAL = "internal.localhost";
    process.env.APP_HOST_EXTERNAL = "external.localhost";

    expect(hostBereich("external.localhost")).toBe("external");
  });

  it("bilinmeyen host için hata verir", () => {
    process.env.APP_HOST_INTERNAL = "internal.localhost";
    process.env.APP_HOST_EXTERNAL = "external.localhost";

    expect(() => hostBereich("unknown.localhost")).toThrow("Unbekannter Host");
  });

  describe("hostDbAuswahl", () => {
    it("internal host için ersteDb döndürür", () => {
      process.env.APP_HOST_INTERNAL = "internal.localhost";
      process.env.APP_HOST_EXTERNAL = "external.localhost";

      expect(hostDbAuswahl("internal.localhost")).toBe(ersteDb);
    });

    it("external host için zweiteDb döndürür", () => {
      process.env.APP_HOST_INTERNAL = "internal.localhost";
      process.env.APP_HOST_EXTERNAL = "external.localhost";

      expect(hostDbAuswahl("external.localhost")).toBe(zweiteDb);
    });
  });
});