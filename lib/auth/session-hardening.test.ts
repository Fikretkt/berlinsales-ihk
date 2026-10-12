import { describe, expect, it, vi, beforeEach } from "vitest";

const mockAuth = vi.fn();
const mockHeaders = vi.fn();
const mockSelect = vi.fn();

vi.mock("@/auth", () => ({
  auth: () => mockAuth(),
}));

vi.mock("next/headers", () => ({
  headers: () => mockHeaders(),
}));

vi.mock("@/lib/db/client", () => ({
  db: {
    select: () => mockSelect(),
  },
}));

// Import after mocks
import { getSessionUser, requireUser, requireAdmin } from "./session";
import { HttpError } from "@/lib/http/errors";

describe("getSessionUser & Session Hardening", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockHeaders.mockResolvedValue(new Headers());
  });

  const validUserId = "11111111-1111-4111-8111-111111111111";
  const validCompanyId = "22222222-2222-4222-8222-222222222222";

  it("returns null when auth() returns null (unauthenticated)", async () => {
    mockAuth.mockResolvedValue(null);
    const user = await getSessionUser();
    expect(user).toBeNull();
  });

  it("returns null when session.user is missing or has no id", async () => {
    mockAuth.mockResolvedValue({ user: null });
    expect(await getSessionUser()).toBeNull();

    mockAuth.mockResolvedValue({ user: { id: "" } });
    expect(await getSessionUser()).toBeNull();
  });

  it("returns null and rejects malformed user IDs without querying DB with invalid UUID", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    mockAuth.mockResolvedValue({ user: { id: "not-a-valid-uuid" } });

    const user = await getSessionUser();
    expect(user).toBeNull();
    expect(mockSelect).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("SESSION_INVALID_USER_ID"));
    warnSpy.mockRestore();
  });

  it("returns null when user is not found in database (deleted user / stale JWT)", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    mockAuth.mockResolvedValue({ user: { id: validUserId } });

    // Mock Drizzle query returning empty rows
    const mockLimit = vi.fn().mockResolvedValue([]);
    const mockWhere = vi.fn().mockReturnValue({ limit: mockLimit });
    const mockLeftJoin = vi.fn().mockReturnValue({ where: mockWhere });
    const mockFrom = vi.fn().mockReturnValue({ leftJoin: mockLeftJoin });
    mockSelect.mockReturnValue({ from: mockFrom });

    const user = await getSessionUser();
    expect(user).toBeNull();
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("SESSION_USER_NOT_FOUND"));
    warnSpy.mockRestore();
  });

  it("returns null when user in database is inactive (deactivated user / stale JWT)", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    mockAuth.mockResolvedValue({ user: { id: validUserId } });

    const mockLimit = vi.fn().mockResolvedValue([
      {
        id: validUserId,
        email: "deactivated@example.com",
        name: "Inactive User",
        role: "field_user",
        companyId: validCompanyId,
        active: false,
        companyIdRef: validCompanyId,
      },
    ]);
    const mockWhere = vi.fn().mockReturnValue({ limit: mockLimit });
    const mockLeftJoin = vi.fn().mockReturnValue({ where: mockWhere });
    const mockFrom = vi.fn().mockReturnValue({ leftJoin: mockLeftJoin });
    mockSelect.mockReturnValue({ from: mockFrom });

    const user = await getSessionUser();
    expect(user).toBeNull();
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("SESSION_USER_INACTIVE"));
    warnSpy.mockRestore();
  });

  it("returns null when user's tenant/company is missing or invalid in database", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    mockAuth.mockResolvedValue({ user: { id: validUserId } });

    const mockLimit = vi.fn().mockResolvedValue([
      {
        id: validUserId,
        email: "orphan@example.com",
        name: "No Company User",
        role: "field_user",
        companyId: validCompanyId,
        active: true,
        companyIdRef: null, // company left join produced null -> company deleted or missing
      },
    ]);
    const mockWhere = vi.fn().mockReturnValue({ limit: mockLimit });
    const mockLeftJoin = vi.fn().mockReturnValue({ where: mockWhere });
    const mockFrom = vi.fn().mockReturnValue({ leftJoin: mockLeftJoin });
    mockSelect.mockReturnValue({ from: mockFrom });

    const user = await getSessionUser();
    expect(user).toBeNull();
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("SESSION_TENANT_INVALID"));
    warnSpy.mockRestore();
  });

  it("returns SessionUser when user is active and belongs to an existing company", async () => {
    mockAuth.mockResolvedValue({ user: { id: validUserId } });

    const mockLimit = vi.fn().mockResolvedValue([
      {
        id: validUserId,
        email: "alice@example.com",
        name: "Alice",
        role: "admin",
        companyId: validCompanyId,
        active: true,
        companyIdRef: validCompanyId,
      },
    ]);
    const mockWhere = vi.fn().mockReturnValue({ limit: mockLimit });
    const mockLeftJoin = vi.fn().mockReturnValue({ where: mockWhere });
    const mockFrom = vi.fn().mockReturnValue({ leftJoin: mockLeftJoin });
    mockSelect.mockReturnValue({ from: mockFrom });

    const user = await getSessionUser();
    expect(user).toEqual({
      id: validUserId,
      email: "alice@example.com",
      name: "Alice",
      role: "admin",
      companyId: validCompanyId,
    });
  });

  it("CRITICAL (Amendment 1): propagates infrastructure/database errors without converting to null", async () => {
    mockAuth.mockResolvedValue({ user: { id: validUserId } });

    const dbError = new Error("Connection terminated unexpectedly (PostgreSQL outage)");
    const mockLimit = vi.fn().mockRejectedValue(dbError);
    const mockWhere = vi.fn().mockReturnValue({ limit: mockLimit });
    const mockLeftJoin = vi.fn().mockReturnValue({ where: mockWhere });
    const mockFrom = vi.fn().mockReturnValue({ leftJoin: mockLeftJoin });
    mockSelect.mockReturnValue({ from: mockFrom });

    // Must NOT return null; must throw the original infrastructure error
    await expect(getSessionUser()).rejects.toThrow("Connection terminated unexpectedly");
  });

  describe("requireUser and requireAdmin guards", () => {
    it("requireUser throws 401 NOT_AUTHENTICATED when getSessionUser returns null", async () => {
      mockAuth.mockResolvedValue(null);
      await expect(requireUser()).rejects.toThrowError(HttpError);
      try {
        await requireUser();
      } catch (err) {
        expect(err).toMatchObject({ status: 401, code: "NOT_AUTHENTICATED" });
      }
    });

    it("requireAdmin throws 403 when user role is not admin", async () => {
      mockAuth.mockResolvedValue({ user: { id: validUserId } });
      const mockLimit = vi.fn().mockResolvedValue([
        {
          id: validUserId,
          email: "bob@example.com",
          name: "Bob",
          role: "field_user",
          companyId: validCompanyId,
          active: true,
          companyIdRef: validCompanyId,
        },
      ]);
      const mockWhere = vi.fn().mockReturnValue({ limit: mockLimit });
      const mockLeftJoin = vi.fn().mockReturnValue({ where: mockWhere });
      const mockFrom = vi.fn().mockReturnValue({ leftJoin: mockLeftJoin });
      mockSelect.mockReturnValue({ from: mockFrom });

      await expect(requireAdmin()).rejects.toThrowError(HttpError);
      try {
        await requireAdmin();
      } catch (err) {
        expect(err).toMatchObject({ status: 403, code: "FIELD_USER_NOT_ALLOWED" });
      }
    });
  });
});
