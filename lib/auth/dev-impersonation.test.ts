import { describe, expect, it } from "vitest";
import { HttpError } from "@/lib/http/errors";
import { assertDevImpersonationAllowed } from "./dev-impersonation";

describe("development impersonation guard", () => {
  it("rejects production even when the feature flag is enabled", () => {
    expect(() =>
      assertDevImpersonationAllowed("admin@example.com", {
        NODE_ENV: "production",
        ALLOW_DEV_IMPERSONATION: "true",
      }),
    ).toThrowError(HttpError);
    try {
      assertDevImpersonationAllowed("admin@example.com", {
        NODE_ENV: "production",
        ALLOW_DEV_IMPERSONATION: "true",
      });
    } catch (error) {
      expect(error).toMatchObject({ status: 403, code: "DEV_IMPERSONATION_FORBIDDEN" });
    }
  });

  it("requires the explicit feature flag outside production", () => {
    expect(() =>
      assertDevImpersonationAllowed("admin@example.com", {
        NODE_ENV: "development",
      }),
    ).toThrowError(HttpError);
    expect(() =>
      assertDevImpersonationAllowed("admin@example.com", {
        NODE_ENV: "development",
        ALLOW_DEV_IMPERSONATION: "true",
      }),
    ).not.toThrow();
  });
});
