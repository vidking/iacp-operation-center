import { z } from "zod";
import { read } from "../crm/service.ts";
import { operationSchema } from "../../types/observation.ts";
import type { Operation } from "../../types/observation.ts";
import type { Principal } from "../../types/security.ts";
import { connectionContext } from "../connections/service.ts";
import { SecurityError } from "../security/config.ts";
import { singleFlight } from "../../refresh.ts";

const upstreamPageSize = 50;
const allowedPageSizes = [25, 50, 100] as const;

export type OperationSort =
  "updated_at" | "created_at" | "operation_id" | "kind" | "status";
export type OperationDirection = "asc" | "desc";

type OperationIndex = {
  entries: Map<string, Operation>;
  complete: boolean;
  nextOffset: number;
  refresh?: Promise<void>;
};

const indexes = new Map<string, OperationIndex>();

function indexKey(user: Principal | undefined) {
  const context = connectionContext(user);
  return `${context.id}:${context.version}:${context.tenant}`;
}

function mergePage(index: OperationIndex, values: Operation[]) {
  for (const operation of values) {
    const previous = index.entries.get(operation.operation_id);
    if (
      !previous ||
      Date.parse(operation.updated_at) >= Date.parse(previous.updated_at)
    )
      index.entries.set(operation.operation_id, operation);
  }
}

async function readUpstreamPage(user: Principal | undefined, offset: number) {
  return read(
    user,
    `/v1/operations?limit=${upstreamPageSize}&offset=${offset}`,
    operationSchema.array(),
  );
}

async function scanFrom(
  user: Principal | undefined,
  index: OperationIndex,
  start: number,
) {
  let offset = start;
  for (;;) {
    if (!Number.isSafeInteger(offset) || offset < 0)
      throw new SecurityError("INVALID_OFFSET");
    const values = await readUpstreamPage(user, offset);
    mergePage(index, values);
    if (values.length < upstreamPageSize) {
      index.nextOffset = offset + values.length;
      index.complete = true;
      return;
    }
    offset += upstreamPageSize;
  }
}

async function refreshIndex(user: Principal | undefined) {
  const key = indexKey(user);
  let index = indexes.get(key);
  if (!index) {
    index = {
      entries: new Map(),
      complete: false,
      nextOffset: 0,
    };
    indexes.set(key, index);
  }
  if (index.refresh) return index.refresh;
  const current = index;
  const pending = (async () => {
    if (!current.complete) {
      current.entries.clear();
      current.nextOffset = 0;
      await scanFrom(user, current, 0);
    } else {
      // IACP exposes append-oriented offset pagination without a total or
      // descending order. Refresh the tail, including one overlap page, so
      // status transitions and newly appended records are observed without
      // rebuilding the complete history on every poll.
      // A changed head with no operation-id overlap means that the upstream
      // history was replaced/rotated (for example after retention or a
      // connection generation change). Keep stale entries out of the global
      // total instead of merging two unrelated histories.
      const head = await readUpstreamPage(user, 0);
      const headOverlaps = head.some((operation) =>
        current.entries.has(operation.operation_id),
      );
      if (current.entries.size && !headOverlaps) {
        current.entries.clear();
        current.nextOffset = 0;
        current.complete = false;
        if (head.length < upstreamPageSize) {
          mergePage(current, head);
          current.nextOffset = head.length;
          current.complete = true;
          return;
        }
        mergePage(current, head);
        await scanFrom(user, current, upstreamPageSize);
      } else {
        await scanFrom(
          user,
          current,
          Math.max(0, current.nextOffset - upstreamPageSize),
        );
      }
    }
  })();
  current.refresh = pending;
  try {
    await pending;
  } finally {
    if (current.refresh === pending) current.refresh = undefined;
  }
}

function valueFor(operation: Operation, sortBy: OperationSort) {
  if (sortBy === "operation_id") return operation.operation_id;
  if (sortBy === "kind") return operation.kind;
  if (sortBy === "status") return operation.normalized_status;
  return Date.parse(
    sortBy === "created_at" ? operation.created_at : operation.updated_at,
  );
}

function compareOperations(
  a: Operation,
  b: Operation,
  sortBy: OperationSort,
  direction: OperationDirection,
) {
  const left = valueFor(a, sortBy),
    right = valueFor(b, sortBy);
  const comparison =
    typeof left === "number" && typeof right === "number"
      ? left - right
      : String(left).localeCompare(String(right), "en", {
          numeric: true,
          sensitivity: "base",
        });
  if (comparison) return direction === "asc" ? comparison : -comparison;
  return a.operation_id.localeCompare(b.operation_id, "en", {
    numeric: true,
    sensitivity: "base",
  });
}

function matches(
  operation: Operation,
  query: {
    instance?: string;
    status?: Operation["normalized_status"] | "active";
    kind?: string;
    query?: string;
  },
) {
  if (query.instance && operation.instance_id !== query.instance) return false;
  if (
    query.status &&
    (query.status === "active"
      ? !["queued", "running", "uncertain"].includes(
          operation.normalized_status,
        )
      : operation.normalized_status !== query.status)
  )
    return false;
  if (query.kind && operation.kind !== query.kind) return false;
  if (!query.query) return true;
  const needle = query.query.toLowerCase();
  return `${operation.operation_id} ${operation.instance_id} ${operation.kind} ${operation.status} ${operation.normalized_status} ${operation.error_code ?? ""} ${operation.requested_by} ${operation.events?.map((event) => `${event.id} ${event.code}`).join(" ") ?? ""}`
    .toLowerCase()
    .includes(needle);
}

function statusCounts(values: Operation[]) {
  const counts = {
    all: values.length,
    queued: 0,
    running: 0,
    completed: 0,
    failed: 0,
    uncertain: 0,
    active: 0,
  };
  for (const operation of values) {
    counts[operation.normalized_status]++;
    if (
      ["queued", "running", "uncertain"].includes(operation.normalized_status)
    )
      counts.active++;
  }
  return counts;
}

function parseInput(input: unknown) {
  return z
    .object({
      offset: z.number().int().nonnegative().optional(),
      pageSize: z
        .number()
        .int()
        .refine((value) =>
          allowedPageSizes.includes(value as (typeof allowedPageSizes)[number]),
        )
        .default(50),
      recent: z.boolean().default(false),
      instance: z.uuid().optional(),
      status: z
        .enum([
          "active",
          "queued",
          "running",
          "completed",
          "failed",
          "uncertain",
        ])
        .optional(),
      kind: z.string().trim().max(128).optional(),
      query: z.string().trim().max(128).optional(),
      sortBy: z
        .enum(["updated_at", "created_at", "operation_id", "kind", "status"])
        .default("updated_at"),
      direction: z.enum(["asc", "desc"]).default("desc"),
    })
    .strict()
    .parse(input);
}

export async function operationHistory(user: Principal | undefined) {
  await refreshIndex(user);
  const key = indexKey(user);
  const index = indexes.get(key);
  if (!index) throw new SecurityError("UPSTREAM_UNAVAILABLE", 503);
  return [...index.entries.values()];
}

export async function operationPage(
  user: Principal | undefined,
  input: unknown,
) {
  const query = parseInput(input);
  return singleFlight(
    `operation-page:${indexKey(user)}:${JSON.stringify(query)}`,
    async () => {
      const history = await operationHistory(user);
      const filtered = history.filter((operation) => matches(operation, query));
      const sorted = [...filtered].sort((a, b) =>
        compareOperations(a, b, query.sortBy, query.direction),
      );
      const total = sorted.length;
      const pageCount = total ? Math.ceil(total / query.pageSize) : 0;
      const offset = query.recent
        ? 0
        : Math.min(
            Math.floor((query.offset ?? 0) / query.pageSize) * query.pageSize,
            Math.max(0, (pageCount - 1) * query.pageSize),
          );
      const operations = sorted.slice(offset, offset + query.pageSize);
      const current = connectionContext(user);
      const observedAt = history.reduce<string | null>(
        (latest, operation) =>
          !latest || Date.parse(operation.updated_at) > Date.parse(latest)
            ? operation.updated_at
            : latest,
        null,
      );
      const queriedAt = new Date().toISOString();
      return {
        operations,
        offset,
        pageSize: query.pageSize,
        page: pageCount ? Math.floor(offset / query.pageSize) + 1 : 0,
        pageCount,
        total,
        hasMore: offset + operations.length < total,
        sortBy: query.sortBy,
        direction: query.direction,
        counts: statusCounts(history),
        queriedAt,
        observedAt,
        evidence: {
          source: "IACP /v1/operations + tenant-scoped read index",
          queriedAt,
          observedAt,
          freshness: observedAt ? "fresh" : "unknown",
          status: "observed",
        },
        scope: `Tenant ${current.tenant}; ${total} registros exactos del historial consultado. IACP no publica total ni orden descendente; el BFF mantiene un índice de lectura incremental y orden estable por ${query.sortBy}.`,
      };
    },
  );
}
