import { describe, expect, it } from "vitest";
import { productionConfigIssues } from "./production";

describe("production configuration readiness", () => {
  it("requires the core runtime configuration in production", () => {
    expect(productionConfigIssues({ NODE_ENV: "production" })).toEqual([
      "DATABASE_URL", "AUTH_SECRET", "AUTH_URL",
    ]);
  });

  it("accepts either supported auth secret name and an explicit trusted host", () => {
    expect(productionConfigIssues({
      NODE_ENV: "production",
      DATABASE_URL: "postgresql://example",
      NEXTAUTH_SECRET: "secret",
      AUTH_TRUST_HOST: "true",
    })).toEqual([]);
  });
});
