import { it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { commercialCreateSchema } from "../src/lib/types/crm";
const payload = {
  name: "isolated-contract-test",
  plan_id: "published-fixture-plan",
  image_id: "published-fixture-image",
  network: { profile_id: "lab-dhcp" },
  access: {
    root_password: "isolated-test-value-never-a-real-credential",
    ssh_public_keys: [],
  },
  start_on_create: true,
};
const technical = [
  "cpu_type",
  "cpu_model",
  "cpu",
  "sockets",
  "cores",
  "numa",
  "machine",
  "bios",
  "scsihw",
  "template_id",
  "disk_size",
  "vcpus",
  "memory_mb",
  "disk_gb",
  "node_preference",
  "architecture",
  "flags",
];
it.each(technical)(
  "rejects technical override %s before commercial serialization",
  (key) => {
    expect(
      commercialCreateSchema.safeParse({
        ...payload,
        [key]: "forbidden-override",
      }).success,
    ).toBe(false);
    expect(
      commercialCreateSchema.safeParse({
        ...payload,
        network: { ...payload.network, [key]: "forbidden-override" },
      }).success,
    ).toBe(false);
    expect(
      commercialCreateSchema.safeParse({
        ...payload,
        access: { ...payload.access, [key]: "forbidden-override" },
      }).success,
    ).toBe(false);
  },
);
it("commercial allowlist is derived from the audited IACP schema and adds no hardware defaults", () => {
  const api = JSON.parse(
    readFileSync("docs/contracts/iacp-deployed-20261026.json", "utf8"),
  );
  expect(Object.keys(commercialCreateSchema.shape).sort()).toEqual(
    Object.keys(
      api.components.schemas.CommercialInstanceCreate.properties,
    ).sort(),
  );
  const parsed = commercialCreateSchema.parse(payload);
  expect(parsed).toEqual(payload);
  expect(Object.keys(parsed)).not.toEqual(expect.arrayContaining(technical));
});
it("frontend serializes selected published plan/image and BFF preserves commercial payload and idempotency", () => {
  const component = readFileSync(
    "src/lib/components/sections/CommercialCatalog.svelte",
    "utf8",
  );
  const backend = readFileSync("src/lib/server/crm/service.ts", "utf8");
  expect(component).toContain("plans.find((p) => p.plan_id === selected)");
  expect(component).toContain("plan_id: plan.plan_id");
  expect(component).toContain("image_id: imageId");
  expect(component).toContain("i.compatible_plans.includes");
  expect(component).toContain("i.authorized");
  expect(backend).toContain("commercialCreateSchema.parse(value.payload)");
  expect(backend).toContain("key: value.key");
  const transport = readFileSync(
    "src/lib/server/connections/transport.ts",
    "utf8",
  );
  expect(transport).toContain('"Idempotency-Key": command.key');
  for (const source of [component, backend, transport])
    expect(source).not.toContain("qemu64");
});
it.each(["lifecycle", "resume", "continue", "cleanup", "reconcile", ""])(
  "blocks real acceptance mode %s before any browser or secret access",
  (mode) => {
    const result = spawnSync(
      process.execPath,
      [
        "--input-type=module",
        "-e",
        `import{assertReadOnlyAcceptance}from'./scripts/real-e2e-policy.mjs';assertReadOnlyAcceptance(${JSON.stringify(mode)});`,
      ],
      { encoding: "utf8" },
    );
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("REAL_INFRASTRUCTURE_E2E_SUSPENDED");
  },
);
it("all known real mutation drivers enforce the hold before reading any credentials", () => {
  for (const file of [
    "verify-product-gui.mjs",
    "verify-lab-gui.mjs",
    "cleanup-lab-test.mjs",
    "capture-lab-evidence.mjs",
    "cleanup-selected-061.mjs",
  ]) {
    const code = readFileSync("scripts/" + file, "utf8");
    expect(code.indexOf("assertReadOnlyAcceptance(")).toBeGreaterThan(0);
    expect(code.indexOf("assertReadOnlyAcceptance(")).toBeLessThan(
      code.indexOf("chromium.launch("),
    );
    expect(code.indexOf("assertReadOnlyAcceptance(")).toBeLessThan(
      code.indexOf('readFileSync("/fixture/'),
    );
  }
  const runner = readFileSync("scripts/run-product-browser.sh", "utf8");
  expect(runner.indexOf("REAL_INFRASTRUCTURE_E2E_SUSPENDED")).toBeLessThan(
    runner.indexOf("\nssh "),
  );
  const validations =
    readFileSync("scripts/validate.sh", "utf8") +
    readFileSync("package.json", "utf8") +
    readFileSync("playwright.config.ts", "utf8");
  expect(validations).not.toMatch(
    /verify-product-gui|verify-lab-gui|run-product-browser|cleanup-lab-test/,
  );
});
