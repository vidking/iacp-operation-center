import { randomUUID } from 'node:crypto';
import type { Database } from './db';
import type { ResourceGrant, Role } from '@iacoc/contracts';

export type ResourceSubject = { id: string; role: Role };

type AssignmentRow = {
  can_read: number;
  can_operate: number;
};

export type ActionIntentRecord = {
  id: string;
  actorId: string;
  connectionId: string;
  requestedName: string | null;
  instanceId: string | null;
  operationId: string | null;
  action: 'provision';
  status: string;
  remoteStatus: string | null;
  createdAt: string;
  updatedAt: string;
};

export type RemoteIdentifiers = {
  instanceId: string | null;
  operationId: string | null;
};

function stringFrom(value: unknown): string | null {
  if (typeof value === 'string' && value) return value;
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return null;
}

/**
 * IACP publishes the accepted identifiers at the top level in both contracts,
 * but some compatible responses wrap them in result/data/instance/operation.
 * Only documented identifier names are traversed; arbitrary nested IDs are not
 * promoted to a resource identifier.
 */
export function extractRemoteIdentifiers(
  value: unknown,
  options: { rootIdAsInstance?: boolean } = {},
): RemoteIdentifiers {
  let instanceId: string | null = null;
  let operationId: string | null = null;
  const visited = new Set<object>();
  const rootIdAsInstance = options.rootIdAsInstance ?? true;

  const visit = (candidate: unknown, root: boolean, depth: number) => {
    if (depth > 4 || !candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
      return;
    }
    const record = candidate as Record<string, unknown>;
    if (visited.has(record)) return;
    visited.add(record);
    if (!operationId) {
      for (const key of ['operation_id', 'operationId', 'job_id', 'jobId']) {
        operationId = stringFrom(record[key]);
        if (operationId) break;
      }
    }
    if (!instanceId) {
      for (const key of ['instance_id', 'instanceId', 'vmid']) {
        instanceId = stringFrom(record[key]);
        if (instanceId) break;
      }
    }
    if (!instanceId && (!root || rootIdAsInstance)) instanceId = stringFrom(record.id);
    for (const key of ['result', 'data', 'output', 'instance', 'operation', 'job']) {
      visit(record[key], false, depth + 1);
    }
  };

  visit(value, true, 0);
  return { instanceId, operationId };
}

export function hasResourceAccess(
  database: Database,
  subject: ResourceSubject,
  connectionId: string,
  instanceId: string,
  operation = false,
): boolean {
  if (subject.role === 'Administrador') return true;
  const row = database
    .prepare(
      'SELECT r.can_read, r.can_operate FROM resource_assignments r JOIN connection_grants c ON c.connection_id = r.connection_id AND c.user_id = r.user_id WHERE r.connection_id = ? AND r.instance_id = ? AND r.user_id = ? AND c.can_read = 1 AND (? = 0 OR c.can_operate = 1)',
    )
    .get(connectionId, instanceId, subject.id, operation ? 1 : 0) as AssignmentRow | undefined;
  if (!row) return false;
  return operation ? row.can_operate === 1 : row.can_read === 1;
}

export function visibleResourceIds(
  database: Database,
  subject: ResourceSubject,
  connectionId: string,
  operation = false,
): Set<string> | null {
  if (subject.role === 'Administrador') return null;
  const rows = database
    .prepare(
      operation
        ? 'SELECT r.instance_id FROM resource_assignments r JOIN connection_grants c ON c.connection_id = r.connection_id AND c.user_id = r.user_id WHERE r.connection_id = ? AND r.user_id = ? AND c.can_operate = 1 AND r.can_operate = 1'
        : 'SELECT r.instance_id FROM resource_assignments r JOIN connection_grants c ON c.connection_id = r.connection_id AND c.user_id = r.user_id WHERE r.connection_id = ? AND r.user_id = ? AND c.can_read = 1 AND r.can_read = 1',
    )
    .all(connectionId, subject.id) as Array<{ instance_id: string }>;
  return new Set(rows.map((row) => row.instance_id));
}

export function filterVisibleResources(
  database: Database,
  subject: ResourceSubject,
  connectionId: string,
  items: Record<string, unknown>[],
): Record<string, unknown>[] {
  const ids = visibleResourceIds(database, subject, connectionId);
  if (!ids) return items;
  return items.filter((item) => {
    const instanceId = item.instance_id ?? item.instanceId ?? item.id;
    return typeof instanceId === 'string' && ids.has(instanceId);
  });
}

export function assignResource(
  database: Database,
  input: {
    connectionId: string;
    instanceId: string;
    userId: string;
    canRead: boolean;
    canOperate: boolean;
    isOwner?: boolean;
    assignedBy?: string | null;
  },
) {
  const now = new Date().toISOString();
  database
    .prepare(
      'INSERT INTO resource_assignments (connection_id, instance_id, user_id, can_read, can_operate, is_owner, assigned_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(connection_id, instance_id, user_id) DO UPDATE SET can_read = excluded.can_read, can_operate = excluded.can_operate, is_owner = excluded.is_owner, assigned_by = excluded.assigned_by, updated_at = excluded.updated_at',
    )
    .run(
      input.connectionId,
      input.instanceId,
      input.userId,
      input.canRead ? 1 : 0,
      input.canOperate ? 1 : 0,
      input.isOwner ? 1 : 0,
      input.assignedBy ?? null,
      now,
      now,
    );
}

export function assignNewResource(
  database: Database,
  connectionId: string,
  instanceId: string,
  ownerId: string,
) {
  assignResource(database, {
    connectionId,
    instanceId,
    userId: ownerId,
    canRead: true,
    canOperate: true,
    isOwner: true,
    assignedBy: ownerId,
  });
}

export function recordActionIntent(
  database: Database,
  input: {
    actorId: string;
    connectionId: string;
    requestedName?: string | null;
    instanceId?: string | null;
    action: string;
    idempotencyKey: string;
    operationId?: string | null;
  },
) {
  const now = new Date().toISOString();
  database
    .prepare(
      'INSERT INTO action_intents (id, actor_id, connection_id, instance_id, requested_name, action, idempotency_key, operation_id, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    )
    .run(
      randomUUID(),
      input.actorId,
      input.connectionId,
      input.instanceId ?? null,
      input.requestedName ?? null,
      input.action,
      input.idempotencyKey,
      input.operationId ?? null,
      input.instanceId ? 'claimed' : 'created',
      now,
      now,
    );
}

export function listActionIntents(
  database: Database,
  input: { connectionId: string; actorId?: string | null; limit?: number },
): ActionIntentRecord[] {
  const limit = Math.max(1, Math.min(input.limit ?? 50, 200));
  const rows = (
    input.actorId
      ? database
          .prepare(
            "SELECT id, actor_id, connection_id, requested_name, instance_id, operation_id, action, status, remote_status, created_at, updated_at FROM action_intents WHERE connection_id = ? AND actor_id = ? AND action = 'provision' ORDER BY created_at DESC LIMIT ?",
          )
          .all(input.connectionId, input.actorId, limit)
      : database
          .prepare(
            "SELECT id, actor_id, connection_id, requested_name, instance_id, operation_id, action, status, remote_status, created_at, updated_at FROM action_intents WHERE connection_id = ? AND action = 'provision' ORDER BY created_at DESC LIMIT ?",
          )
          .all(input.connectionId, limit)
  ) as Array<{
    id: string;
    actor_id: string;
    connection_id: string;
    requested_name: string | null;
    instance_id: string | null;
    operation_id: string | null;
    action: 'provision';
    status: string;
    remote_status: string | null;
    created_at: string;
    updated_at: string;
  }>;
  return rows.map((row) => ({
    id: row.id,
    actorId: row.actor_id,
    connectionId: row.connection_id,
    requestedName: row.requested_name,
    instanceId: row.instance_id,
    operationId: row.operation_id,
    action: row.action,
    status: row.status,
    remoteStatus: row.remote_status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}

export function updateActionIntentEvidence(
  database: Database,
  id: string,
  input: { instanceId?: string | null; operationId?: string | null; remoteStatus?: string | null },
) {
  database
    .prepare(
      'UPDATE action_intents SET instance_id = COALESCE(?, instance_id), operation_id = COALESCE(?, operation_id), remote_status = COALESCE(?, remote_status), status = CASE WHEN ? IS NOT NULL THEN ? ELSE status END, updated_at = ? WHERE id = ?',
    )
    .run(
      input.instanceId ?? null,
      input.operationId ?? null,
      input.remoteStatus ?? null,
      input.remoteStatus ?? null,
      input.remoteStatus ?? null,
      new Date().toISOString(),
      id,
    );
}

export function claimProvisionedResources(
  database: Database,
  connectionId: string,
  items: Record<string, unknown>[],
) {
  const claim = database.prepare(
    "UPDATE action_intents SET instance_id = COALESCE(?, instance_id), operation_id = COALESCE(?, operation_id), remote_status = COALESCE(?, remote_status), status = 'claimed', updated_at = ? WHERE id = ?",
  );
  for (const item of items) {
    const identifiers = extractRemoteIdentifiers(item, {
      rootIdAsInstance: !['operation_id', 'operationId', 'job_id', 'jobId'].some(
        (key) => key in item,
      ),
    });
    const requestedName = stringFrom(item.name ?? item.instance_name);
    const clauses: string[] = [];
    const params: Array<string | number | null> = [connectionId];
    if (identifiers.operationId) {
      clauses.push('operation_id = ?');
      params.push(identifiers.operationId);
    }
    if (identifiers.instanceId) {
      clauses.push('instance_id = ?');
      params.push(identifiers.instanceId);
    }
    if (requestedName) {
      clauses.push('requested_name = ?');
      params.push(requestedName);
    }
    if (clauses.length === 0) continue;
    const remoteStatus = stringFrom(item.normalized_status ?? item.status);
    if (remoteStatus?.toLowerCase() === 'deleted' && identifiers.instanceId) {
      // A tombstone is still useful for audit, but it must not keep a live
      // portal grant that can reach a resource which no longer exists.
      database
        .prepare('DELETE FROM resource_assignments WHERE connection_id = ? AND instance_id = ?')
        .run(connectionId, identifiers.instanceId);
    }
    const intent = database
      .prepare(
        `SELECT id, actor_id FROM action_intents WHERE connection_id = ? AND action = 'provision' AND status IN ('created', 'claimed') AND (${clauses.join(' OR ')}) ORDER BY created_at DESC LIMIT 1`,
      )
      .get(...params) as { id: string; actor_id: string } | undefined;
    if (!intent) continue;
    if (!identifiers.instanceId) continue;
    assignResource(database, {
      connectionId,
      instanceId: identifiers.instanceId,
      userId: intent.actor_id,
      canRead: true,
      canOperate: true,
      isOwner: true,
      assignedBy: intent.actor_id,
    });
    claim.run(
      identifiers.instanceId,
      identifiers.operationId,
      remoteStatus,
      new Date().toISOString(),
      intent.id,
    );
  }
}

export function listResourceAssignments(database: Database, userId?: string): ResourceGrant[] {
  const rows = (
    userId
      ? database
          .prepare(
            'SELECT connection_id, instance_id, can_read, can_operate FROM resource_assignments WHERE user_id = ? ORDER BY connection_id, instance_id',
          )
          .all(userId)
      : database
          .prepare(
            'SELECT connection_id, instance_id, can_read, can_operate FROM resource_assignments ORDER BY user_id, connection_id, instance_id',
          )
          .all()
  ) as Array<{
    connection_id: string;
    instance_id: string;
    can_read: number;
    can_operate: number;
  }>;
  return rows.map((row) => ({
    connectionId: row.connection_id,
    instanceId: row.instance_id,
    canRead: row.can_read === 1,
    canOperate: row.can_operate === 1,
  }));
}
