import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { importMarketsFromCsv } from "@/lib/csv/import";
import { getMarketDetail, listMarketMapMarkers, listMarkets } from "@/lib/markets/repo";
import {
  makeCompany,
  makeUser,
  startTestDatabase,
  stopTestDatabase,
  truncateUserData,
  type TestContext,
} from "../helpers/db";
import type { SessionUser } from "@/lib/http/errors";

const SALES_PIPELINE_CSV = [
  "Company Name;Contact Name;Contact Email;Contact Phone;Stage;Expected Volume (€);Offer;Total Net Revenue (€);Lead Source;Type of Client;Channel;Probability (%);Date Entered;Expected Close;Days in Stage;Last Activity;Next Action;Notes",
  "Pipeline GmbH;Ada Lovelace;ada@example.com;+49 30 123;Qualification;€45.000;0.5%;€0;Messe;Enterprise;Direkt;60%;01-Jul-2026;15-Okt-2026;4;30-Nov-2026;Angebot nachfassen;Importierte Notiz",
].join("\n");

function session(id: string, companyId: string): SessionUser {
  return { id, companyId, role: "admin", name: "Admin", email: "admin@example.com", bereich: "internal" };
}

describe("Sales Pipeline CSV import", () => {
  let ctx: TestContext;

  beforeAll(async () => { ctx = await startTestDatabase(); });
  afterAll(async () => { await stopTestDatabase(ctx); });
  beforeEach(async () => { await truncateUserData(ctx); });

  it("imports a valid pipeline row and stores its mapped sales data", async () => {
    const companyId = await makeCompany(ctx, "Pipeline Tenant");
    const adminId = await makeUser(ctx, { companyId, role: "admin" });

    const result = await importMarketsFromCsv(
      SALES_PIPELINE_CSV,
      "insert-only",
      session(adminId, companyId),
      "sales-pipeline",
    );

    expect(result).toMatchObject({ totalRows: 1, imported: 1, errors: [] });
    const list = await listMarkets(companyId, adminId, {});
    expect(list.items).toHaveLength(1);

    const detail = await getMarketDetail(companyId, list.items[0]!.id);
    expect(detail.kind).toBe("ok");
    if (detail.kind === "ok") {
      expect(detail.market).toMatchObject({
        name: "Pipeline GmbH",
        contactPerson: "Ada Lovelace",
        contactEmail: "ada@example.com",
        contactPhone: "+49 30 123",
        salesStage: "kontaktiert",
        expectedVolume: 45000,
        probability: 60,
        leadSource: "Messe",
        clientType: "Enterprise",
        channel: "Direkt",
        nextAction: "Angebot nachfassen",
        importedNotes: "Importierte Notiz",
      });
    }
  });

  it("uses the importing admin's tenant and keeps coordinate-less customers out of map markers", async () => {
    const companyA = await makeCompany(ctx, "Tenant A");
    const companyB = await makeCompany(ctx, "Tenant B");
    const adminA = await makeUser(ctx, { companyId: companyA, role: "admin" });
    const adminB = await makeUser(ctx, { companyId: companyB, role: "admin" });

    await importMarketsFromCsv(
      SALES_PIPELINE_CSV,
      "insert-only",
      session(adminA, companyA),
      "sales-pipeline",
    );

    const listA = await listMarkets(companyA, adminA, {});
    const listB = await listMarkets(companyB, adminB, {});
    const mapA = await listMarketMapMarkers(companyA, adminA, {});

    expect(listA.items).toHaveLength(1);
    expect(listA.items[0]).toMatchObject({ lat: null, lng: null });
    expect(listB.items).toHaveLength(0);
    expect(mapA).toHaveLength(0);
  });
});
