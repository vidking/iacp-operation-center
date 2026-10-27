import { describe, expect, it } from "vitest";
import { assertAuthorizedAcceptance } from "../scripts/real-e2e-policy.mjs";

describe("real E2E policy", () => {
  it("keeps baseline and read non-mutating", () => {
    expect(assertAuthorizedAcceptance("baseline", undefined)).toBe("read-only");
    expect(assertAuthorizedAcceptance("read", undefined)).toBe("read-only");
  });

  it("requires the exact single-disposable approval", () => {
    expect(() => assertAuthorizedAcceptance("mutating", undefined)).toThrow(
      "REAL_INFRASTRUCTURE_E2E_SUSPENDED",
    );
    expect(() =>
      assertAuthorizedAcceptance("mutating", "--approve-other-resource"),
    ).toThrow("REAL_INFRASTRUCTURE_E2E_SUSPENDED");
  });

  it("allows only the named disposable MNG scope", () => {
    expect(
      assertAuthorizedAcceptance("mutating", "--approve-single-disposable-mng"),
    ).toBe("single-disposable-mng");
    expect(
      assertAuthorizedAcceptance(
        "mutating",
        "--approve-single-disposable-mng",
        ["--stop-after-provision"],
      ),
    ).toBe("single-disposable-mng-provision");
  });

  it("requires a checkpoint and hardware evidence for continuation", () => {
    expect(
      assertAuthorizedAcceptance(
        "continue",
        "--approve-single-disposable-mng",
        [
          "--checkpoint=/evidence/checkpoint.json",
          "--hardware-evidence=/evidence/hardware.json",
        ],
      ),
    ).toBe("single-disposable-mng-continuation");
    expect(() =>
      assertAuthorizedAcceptance(
        "continue",
        "--approve-single-disposable-mng",
        [],
      ),
    ).toThrow("REAL_INFRASTRUCTURE_E2E_SUSPENDED");
  });
});
