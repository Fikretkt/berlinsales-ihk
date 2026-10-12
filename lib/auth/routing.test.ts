import { describe, expect, it } from "vitest";
import {
  checkRouteAccess,
  isPublicAuthRoute,
  isPublicApiRoute,
} from "./routing";

describe("Edge Middleware Route Access Check", () => {
  describe("Route classification helpers", () => {
    it("identifies public auth pages correctly", () => {
      expect(isPublicAuthRoute("/auth/login")).toBe(true);
      expect(isPublicAuthRoute("/auth/setup")).toBe(true);
      expect(isPublicAuthRoute("/auth/reset")).toBe(true);
      expect(isPublicAuthRoute("/auth/reset-confirm")).toBe(true);
      expect(isPublicAuthRoute("/")).toBe(false);
      expect(isPublicAuthRoute("/markets")).toBe(false);
      expect(isPublicAuthRoute("/admin")).toBe(false);
    });

    it("identifies public auth API routes correctly", () => {
      expect(isPublicApiRoute("/api/v1/auth/login")).toBe(true);
      expect(isPublicApiRoute("/api/v1/auth/setup")).toBe(true);
      expect(isPublicApiRoute("/api/v1/auth/reset-request")).toBe(true);
      expect(isPublicApiRoute("/api/v1/auth/reset-confirm")).toBe(true);
      expect(isPublicApiRoute("/api/v1/markets")).toBe(false);
      expect(isPublicApiRoute("/api/v1/auth/logout")).toBe(false);
    });
  });

  describe("Protected routes", () => {
    it("rejects unauthenticated requests to protected pages and redirects to /auth/login", () => {
      const rootResult = checkRouteAccess({ pathname: "/", isLoggedIn: false });
      expect(rootResult).toEqual({ allowed: false, redirectTo: "/auth/login" });

      const marketResult = checkRouteAccess({ pathname: "/markets", isLoggedIn: false });
      expect(marketResult).toEqual({ allowed: false, redirectTo: "/auth/login" });

      const adminResult = checkRouteAccess({ pathname: "/admin/markets", isLoggedIn: false });
      expect(adminResult).toEqual({ allowed: false, redirectTo: "/auth/login" });
    });

    it("allows authenticated requests to protected pages", () => {
      const rootResult = checkRouteAccess({ pathname: "/", isLoggedIn: true });
      expect(rootResult).toEqual({ allowed: true });

      const marketResult = checkRouteAccess({ pathname: "/markets/123", isLoggedIn: true });
      expect(marketResult).toEqual({ allowed: true });

      const adminResult = checkRouteAccess({ pathname: "/admin/users", isLoggedIn: true });
      expect(adminResult).toEqual({ allowed: true });
    });
  });

  describe("Public auth routes with stale/present session (Production Incident Regression)", () => {
    it("allows unauthenticated requests to /auth/login", () => {
      const result = checkRouteAccess({ pathname: "/auth/login", isLoggedIn: false });
      expect(result).toEqual({ allowed: true });
    });

    it("CRITICAL: allows requests to /auth/login even when isLoggedIn is true (stale JWT)", () => {
      // In production, when a stale JWT was in the browser cookies, the old middleware
      // redirected /auth/login to "/", while "/" redirected back to /auth/login, causing
      // an infinite redirect loop (ERR_TOO_MANY_REDIRECTS).
      // The fixed routing MUST allow /auth/login to render so the user can re-authenticate.
      const result = checkRouteAccess({ pathname: "/auth/login", isLoggedIn: true });
      expect(result).toEqual({ allowed: true });
      expect(result.redirectTo).toBeUndefined();
    });

    it("allows /auth/reset, /auth/setup, and /auth/reset-confirm regardless of login state", () => {
      expect(checkRouteAccess({ pathname: "/auth/reset", isLoggedIn: true })).toEqual({ allowed: true });
      expect(checkRouteAccess({ pathname: "/auth/reset", isLoggedIn: false })).toEqual({ allowed: true });
      expect(checkRouteAccess({ pathname: "/auth/setup", isLoggedIn: true })).toEqual({ allowed: true });
      expect(checkRouteAccess({ pathname: "/auth/setup", isLoggedIn: false })).toEqual({ allowed: true });
      expect(checkRouteAccess({ pathname: "/auth/reset-confirm", isLoggedIn: true })).toEqual({ allowed: true });
      expect(checkRouteAccess({ pathname: "/auth/reset-confirm", isLoggedIn: false })).toEqual({ allowed: true });
    });

    it("allows public auth API endpoints regardless of login state", () => {
      expect(checkRouteAccess({ pathname: "/api/v1/auth/login", isLoggedIn: false })).toEqual({ allowed: true });
      expect(checkRouteAccess({ pathname: "/api/v1/auth/login", isLoggedIn: true })).toEqual({ allowed: true });
      expect(checkRouteAccess({ pathname: "/api/v1/auth/reset-request", isLoggedIn: false })).toEqual({ allowed: true });
    });
  });
});
