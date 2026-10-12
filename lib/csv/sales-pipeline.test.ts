import { describe, expect, it } from "vitest";
import {
  mapSalesPipelineStage,
  parseSalesPipelineDate,
  parseSalesPipelineMoney,
  parseSalesPipelineProbability,
} from "./import";
import { calculateExpectedNetRevenue } from "@/lib/sales/revenue";

describe("Sales Pipeline CSV parsing", () => {
  it("maps the supported source stages", () => {
    expect(mapSalesPipelineStage("Qualification")).toBe("kontaktiert");
    expect(mapSalesPipelineStage("Proposal Sent")).toBe("angebot");
    expect(mapSalesPipelineStage("Negotiation")).toBe("angebot");
    expect(mapSalesPipelineStage("Closed Won")).toBe("gewonnen");
    expect(mapSalesPipelineStage("Closed Lost")).toBe("verloren");
    expect(mapSalesPipelineStage("Discovery")).toBeNull();
  });

  it("parses Excel money and probabilities", () => {
    expect(parseSalesPipelineMoney("€45.000")).toBe(45000);
    expect(parseSalesPipelineProbability("60%")).toBe(60);
  });

  it("parses English and German source dates", () => {
    expect(parseSalesPipelineDate("01-Jul-2026")?.toISOString()).toContain("2026-07-01");
    expect(parseSalesPipelineDate("15-Okt-2026")?.toISOString()).toContain("2026-10-15");
    expect(parseSalesPipelineDate("30-Nov-2026")?.toISOString()).toContain("2026-11-30");
  });

  it("calculates expected net revenue from volume and probability", () => {
    expect(calculateExpectedNetRevenue(45000, 60)).toBe(135);
    expect(calculateExpectedNetRevenue(12000, 30)).toBe(18);
    expect(calculateExpectedNetRevenue(28000, 80)).toBe(112);
  });
});
