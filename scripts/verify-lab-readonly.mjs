// Docker only. One specifically authorized token on stdin; no secret output or file copy.
import { secureJson } from "../src/lib/server/connections/transport.ts";
import {
  profileSchema,
  policySchema,
  usageSchema,
  instanceSchema,
} from "../src/lib/types/crm.ts";
import {
  diagnosticsSchema,
  operationSchema,
} from "../src/lib/types/observation.ts";
let token = "";
try {
  for await (const chunk of process.stdin) {
    token += chunk;
    if (token.length > 4096) throw new Error();
  }
  token = token.trim();
  const endpoint = "https://iac.cyberfuel.com";
  const read = (path) => secureJson(endpoint, path, token);
  const contract = await read("/openapi.json");
  console.log(
    "Deployed contract",
    JSON.stringify({
      version: contract.info.version,
      creationRef:
        contract.paths?.["/v1/instances"]?.post?.requestBody?.content?.[
          "application/json"
        ]?.schema?.$ref,
      routes: Object.keys(contract.paths ?? {}).filter((p) =>
        /plans|images|catalog|product|commercial|capacit|entitlement|tenant/.test(
          p,
        ),
      ),
    }),
  );
  if (process.env.IACOC_CONTRACT_OUTPUT) {
    const { writeFileSync } = await import("node:fs");
    writeFileSync(
      process.env.IACOC_CONTRACT_OUTPUT,
      JSON.stringify(contract, null, 2) + "\n",
    );
  }
  const plans = await read("/v1/plans");
  const images = await read("/v1/images");
  console.log(
    "Commercial availability",
    JSON.stringify({
      plans: plans.map((p) => ({
        id: p.plan_id,
        resources: {
          vcpus: p.vcpus,
          memory_mb: p.memory_mb,
          disk_gb: p.disk_gb,
        },
        availability: p.availability,
      })),
      images: images.map((i) => ({
        id: i.image_id,
        status: i.status,
        authorized: i.authorized,
        availability: i.availability,
      })),
    }),
  );
  const scope = diagnosticsSchema.parse(await read("/v1/observability"));
  const instances = instanceSchema
    .array()
    .parse(await read("/v1/instances?limit=100&offset=0"));
  const operations = operationSchema
    .array()
    .parse(await read("/v1/operations?limit=50&offset=0"));
  if (instances.some((i) => i.tenant_id !== scope.tenant_id)) throw new Error();
  console.log(
    JSON.stringify(
      {
        observedAt: new Date().toISOString(),
        authenticated: true,
        tenant: scope.tenant_id,
        inventoryPageCount: instances.length,
        kvmPageCount: instances.filter((i) => i.infrastructure_kind === "kvm")
          .length,
        operationPageCount: operations.length,
        mutationsSent: 0,
      },
      null,
      2,
    ),
  );
} catch (e) {
  console.error("LAB_READONLY_FAILED", e?.code ?? "CONTRACT_OR_SCOPE_ERROR");
  process.exitCode = 1;
} finally {
  token = "";
}
