import { describe, expect, it } from "vitest";
import { assertNonProduction, requireDevAdminPassword } from "./non-production";

describe("development tooling guard", () => {
  it("rejects production execution", () => {
    expect(() => assertNonProduction({ NODE_ENV: "production" })).toThrow(
      "disabled in production",
    );
    expect(() =>
      requireDevAdminPassword({
        NODE_ENV: "production",
        DEV_ADMIN_PASSWORD: "not-used",
      }),
    ).toThrow("disabled in production");
  });

  it("requires a password outside production", () => {
    expect(() => requireDevAdminPassword({ NODE_ENV: "development" })).toThrow(
      "DEV_ADMIN_PASSWORD is required",
    );
    expect(
      requireDevAdminPassword({
        NODE_ENV: "development",
        DEV_ADMIN_PASSWORD: "from-env",
      }),
    ).toBe("from-env");
  });
});
