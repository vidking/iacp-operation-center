import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

export type Database = DatabaseSync;

export function openDatabase(filename: string): Database {
  if (filename !== ':memory:') {
    mkdirSync(dirname(filename), { recursive: true });
  }
  const database = new DatabaseSync(filename);
  database.exec(
    [
      'PRAGMA journal_mode = WAL;',
      'PRAGMA foreign_keys = ON;',
      'PRAGMA secure_delete = ON;',
      'CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, username TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL, role TEXT NOT NULL, tenant TEXT NOT NULL, created_at TEXT NOT NULL);',
      'CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, csrf_hash TEXT NOT NULL, expires_at TEXT NOT NULL, created_at TEXT NOT NULL);',
      'CREATE TABLE IF NOT EXISTS connections (id TEXT PRIMARY KEY, name TEXT NOT NULL, endpoint TEXT NOT NULL, kind TEXT NOT NULL, status TEXT NOT NULL, scope_confirmed INTEGER NOT NULL DEFAULT 0, mode TEXT NOT NULL DEFAULT "READ_ONLY", active INTEGER NOT NULL DEFAULT 0, tenant_id TEXT, tenant_published INTEGER NOT NULL DEFAULT 0, dependencies TEXT NOT NULL DEFAULT "unknown", last_validation_at TEXT, evidence_at TEXT, credential_version INTEGER NOT NULL DEFAULT 0, contract_fingerprint TEXT, endpoint_fingerprint TEXT NOT NULL, credential_ciphertext TEXT, credential_nonce TEXT, credential_tag TEXT, credential_key_id TEXT, updated_at TEXT NOT NULL);',
      'CREATE TABLE IF NOT EXISTS connection_grants (connection_id TEXT NOT NULL REFERENCES connections(id) ON DELETE CASCADE, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, can_read INTEGER NOT NULL DEFAULT 1, can_operate INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL, PRIMARY KEY (connection_id, user_id));',
      'CREATE TABLE IF NOT EXISTS user_settings (user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE, theme TEXT NOT NULL DEFAULT "graphite", font_scale TEXT NOT NULL DEFAULT "normal", density TEXT NOT NULL DEFAULT "comfortable", reduced_motion INTEGER NOT NULL DEFAULT 0, refresh_interval_seconds TEXT NOT NULL DEFAULT "5", updated_at TEXT NOT NULL);',
      'CREATE TABLE IF NOT EXISTS resource_assignments (connection_id TEXT NOT NULL REFERENCES connections(id) ON DELETE CASCADE, instance_id TEXT NOT NULL, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, can_read INTEGER NOT NULL DEFAULT 1, can_operate INTEGER NOT NULL DEFAULT 0, is_owner INTEGER NOT NULL DEFAULT 0, assigned_by TEXT REFERENCES users(id) ON DELETE SET NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, PRIMARY KEY (connection_id, instance_id, user_id));',
      "CREATE TABLE IF NOT EXISTS action_intents (id TEXT PRIMARY KEY, actor_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, connection_id TEXT NOT NULL REFERENCES connections(id) ON DELETE CASCADE, instance_id TEXT, requested_name TEXT, action TEXT NOT NULL, idempotency_key TEXT NOT NULL UNIQUE, operation_id TEXT, status TEXT NOT NULL DEFAULT 'created', remote_status TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);",
      'CREATE TABLE IF NOT EXISTS audit_events (id TEXT PRIMARY KEY, actor_id TEXT, action TEXT NOT NULL, resource TEXT NOT NULL, correlation_id TEXT NOT NULL, created_at TEXT NOT NULL);',
      'CREATE INDEX IF NOT EXISTS idx_sessions_expiry ON sessions(expires_at);',
      'CREATE INDEX IF NOT EXISTS idx_connections_active ON connections(active);',
      'CREATE INDEX IF NOT EXISTS idx_connection_grants_user ON connection_grants(user_id);',
      'CREATE INDEX IF NOT EXISTS idx_resource_assignments_user ON resource_assignments(user_id, connection_id);',
      'CREATE INDEX IF NOT EXISTS idx_resource_assignments_resource ON resource_assignments(connection_id, instance_id);',
      'CREATE INDEX IF NOT EXISTS idx_action_intents_actor ON action_intents(actor_id, created_at);',
    ].join('\n'),
  );
  const columns = database.prepare('PRAGMA table_info(connections)').all() as Array<{
    name: string;
  }>;
  const existing = new Set(columns.map((column) => column.name));
  for (const column of [
    'credential_ciphertext',
    'credential_nonce',
    'credential_tag',
    'credential_key_id',
  ]) {
    if (!existing.has(column)) {
      database.exec(`ALTER TABLE connections ADD COLUMN ${column} TEXT`);
    }
  }
  const settingsColumns = database.prepare('PRAGMA table_info(user_settings)').all() as Array<{
    name: string;
  }>;
  const existingSettingsColumns = new Set(settingsColumns.map((column) => column.name));
  if (!existingSettingsColumns.has('density')) {
    database.exec(
      'ALTER TABLE user_settings ADD COLUMN density TEXT NOT NULL DEFAULT "comfortable"',
    );
  }
  if (!existingSettingsColumns.has('reduced_motion')) {
    database.exec('ALTER TABLE user_settings ADD COLUMN reduced_motion INTEGER NOT NULL DEFAULT 0');
  }
  if (!existingSettingsColumns.has('refresh_interval_seconds')) {
    database.exec(
      'ALTER TABLE user_settings ADD COLUMN refresh_interval_seconds TEXT NOT NULL DEFAULT "5"',
    );
  }
  const intentColumns = database.prepare('PRAGMA table_info(action_intents)').all() as Array<{
    name: string;
  }>;
  const existingIntentColumns = new Set(intentColumns.map((column) => column.name));
  if (!existingIntentColumns.has('requested_name')) {
    database.exec('ALTER TABLE action_intents ADD COLUMN requested_name TEXT');
  }
  if (!existingIntentColumns.has('remote_status')) {
    database.exec('ALTER TABLE action_intents ADD COLUMN remote_status TEXT');
  }
  return database;
}

export function closeDatabase(database: Database): void {
  database.close();
}
