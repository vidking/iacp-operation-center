// Respuestas IACP sintéticas, exclusivamente para el servidor de pruebas 4176.
import { readFileSync } from "node:fs";
export async function fixtureRead(endpoint, path, token) {
  const state = JSON.parse(
    readFileSync(
      process.env.IACOC_TEST_UPSTREAM_FILE ??
        ".artifacts/e2e-4176/upstream.json",
      "utf8",
    ),
  );
  if (
    !["https://iac.cyberfuel.com", "https://iacp-alt-fixture.invalid"].includes(
      endpoint,
    )
  )
    return { error: "ENDPOINT_NOT_ALLOWED" };
  if (path === "/health/ready") return { body: { status: "ready" } };
  if (token !== state.token || state.revoked)
    return { error: "UPSTREAM_UNAUTHORIZED" };
  const operation = {
    operation_id: "live-operation-001",
    instance_id: "live-instance-001",
    kind: "provision",
    status: "failed",
    normalized_status: "uncertain",
    requested_by: "reader-fixture",
    error_code: "PROVISIONING_UNCERTAIN",
    recovery_required: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  if (path === "/v1/observability")
    return {
      body: {
        tenant_id: state.tenant,
        observed_at: new Date().toISOString(),
        dependencies: { orchestrator: "ready" },
        active_operations: 1,
        uncertain_operations: 1,
        oldest_active_age_seconds: 45,
        worker_liveness: "unknown",
        queue_scope: "not-disclosed",
      },
    };
  if (path.startsWith("/v1/events"))
    return {
      body: {
        events: [
          {
            event_id: 42,
            correlation_id: "live-correlation-001",
            operation_id: operation.operation_id,
            instance_id: operation.instance_id,
            tenant_id: state.tenant,
            occurred_at: operation.updated_at,
            kind: "provisioning_uncertain",
            status: "uncertain",
            code: operation.error_code,
            actor: "fixture-reader",
            service: "IACP Orchestrator",
          },
        ],
        next_after: 42,
      },
    };
  if (path.startsWith("/v1/operations/"))
    return { body: { ...operation, requested_by: "verified-detail" } };
  if (path.startsWith("/v1/operations?")) return { body: [operation] };
  return { error: "UPSTREAM_HTTP_ERROR" };
}
