import { describe, it, expect } from "vitest";
import {
  computeResultingStatus,
  InvalidActionCombinationError,
  MissingTargetStatusError,
  InvalidTargetStatusError,
} from "./compute";

describe("computeResultingStatus — visit", () => {
  it("visit/success → gelb", () => {
    expect(computeResultingStatus("visit", "success")).toBe("gelb");
  });
  it("visit/escalation → rosa", () => {
    expect(computeResultingStatus("visit", "escalation")).toBe("rosa");
  });
  it("visit/no_contact → rot", () => {
    expect(computeResultingStatus("visit", "no_contact")).toBe("rot");
  });
  it("visit/declined → rot", () => {
    expect(computeResultingStatus("visit", "declined")).toBe("rot");
  });
  it("visit ohne result → Error", () => {
    expect(() => computeResultingStatus("visit", null)).toThrow(
      InvalidActionCombinationError,
    );
  });
  it("visit mit fremdem result → Error", () => {
    expect(() =>
      computeResultingStatus("visit", "ok" as never),
    ).toThrow(InvalidActionCombinationError);
  });
});

describe("computeResultingStatus — profi_visit", () => {
  it("profi_visit/success → gelb", () => {
    expect(computeResultingStatus("profi_visit", "success")).toBe("gelb");
  });
  it("profi_visit/declined → rot", () => {
    expect(computeResultingStatus("profi_visit", "declined")).toBe("rot");
  });
  it("profi_visit/no_contact → Error", () => {
    expect(() => computeResultingStatus("profi_visit", "no_contact")).toThrow(
      InvalidActionCombinationError,
    );
  });
});

describe("computeResultingStatus — delivery", () => {
  it("delivery (kein result) → orange", () => {
    expect(computeResultingStatus("delivery", null)).toBe("orange");
  });
  it("delivery mit result → Error", () => {
    expect(() => computeResultingStatus("delivery", "success")).toThrow(
      InvalidActionCombinationError,
    );
  });
});

describe("computeResultingStatus — control", () => {
  it("control/ok → rot", () => {
    expect(computeResultingStatus("control", "ok")).toBe("rot");
  });
  it("control/problem → gelb", () => {
    expect(computeResultingStatus("control", "problem")).toBe("gelb");
  });
  it("control ohne result → Error", () => {
    expect(() => computeResultingStatus("control", null)).toThrow(
      InvalidActionCombinationError,
    );
  });
});

describe("computeResultingStatus — cancel_order", () => {
  it("cancel_order → gruen", () => {
    expect(computeResultingStatus("cancel_order", null)).toBe("gruen");
  });
  it("cancel_order mit result → Error", () => {
    expect(() => computeResultingStatus("cancel_order", "success")).toThrow(
      InvalidActionCombinationError,
    );
  });
});

describe("computeResultingStatus — manual_override", () => {
  it("liefert target_status zurück", () => {
    expect(computeResultingStatus("manual_override", null, "rot")).toBe("rot");
    expect(computeResultingStatus("manual_override", null, "gruen")).toBe(
      "gruen",
    );
    expect(computeResultingStatus("manual_override", null, "grau")).toBe(
      "grau",
    );
  });
  it("ohne target_status → MissingTargetStatusError", () => {
    expect(() => computeResultingStatus("manual_override", null)).toThrow(
      MissingTargetStatusError,
    );
  });
  it("mit target_status='blau' → InvalidTargetStatusError", () => {
    expect(() =>
      computeResultingStatus("manual_override", null, "blau"),
    ).toThrow(InvalidTargetStatusError);
  });
  it("mit ungültigem target_status → InvalidTargetStatusError", () => {
    expect(() =>
      computeResultingStatus("manual_override", null, "lila"),
    ).toThrow(InvalidTargetStatusError);
  });
});
