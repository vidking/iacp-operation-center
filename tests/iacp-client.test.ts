import { it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { iacpOperations } from "../src/lib/types/iacp.generated";
import { contractPath, crmActions } from "../src/lib/types/iacp-client";
it("maps all generated public operation IDs to the audited deployed contract", () => {
  const api = JSON.parse(
    readFileSync("docs/contracts/iacp-deployed-20261026-061.json", "utf8"),
  );
  const ids: string[] = [];
  for (const [path, item] of Object.entries(api.paths))
    for (const [method, value] of Object.entries(item as Record<string, any>))
      if (["get", "post", "delete", "put", "patch"].includes(method)) {
        ids.push(value.operationId);
        expect(
          iacpOperations[value.operationId as keyof typeof iacpOperations],
        ).toMatchObject({ method: method.toUpperCase(), path });
      }
  expect(Object.keys(iacpOperations).sort()).toEqual(ids.sort());
});
it("builds only declared paths and rejects path/query injection", () => {
  expect(
    contractPath("discoverInstanceNetwork", {
      instance_id: "11111111-1111-4111-8111-111111111111",
    }),
  ).toBe("/v1/instances/11111111-1111-4111-8111-111111111111/network/discover");
  for (const id of [
    "../admin",
    "uuid?force=true",
    "http://other",
    "{instance_id}",
  ])
    expect(() => contractPath("getInstance", { instance_id: id })).toThrow(
      "INVALID_CONTRACT_PARAMETERS",
    );
  expect(() => contractPath("getInstance", { tenant_id: "other" })).toThrow();
  expect(Object.values(crmActions)).not.toContain("createSmokeJob");
});
