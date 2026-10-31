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
      'CREATE TABLE IF NOT EXISTS connections (id TEXT PRIMARY KEY, name TEXT NOT NULL, endpoint TEXT NOT NULL, kind TEXT NOT NULL, status TEXT NOT NULL, scope_confirmed INTEGER NOT NULL DEFAULT 0, mode TEXT NOT NULL DEFAULT "READ_ONLY", active INTEGER NOT NULL DEFAULT 0, tenant_id TEXT, tenant_published INTEGER NOT NULL DEFAULT 0, dependencies TEXT NOT NULL DEFAULT "unknown", last_validation_at TEXT, evidence_at TEXT, credential_version INTEGER NOT NULL DEFAULT 0, contract_fingerprint TEXT, endpoint_fingerprint TEXT NOT NULL, updated_at TEXT NOT NULL);',
      'CREATE TABLE IF NOT EXISTS audit_events (id TEXT PRIMARY KEY, actor_id TEXT, action TEXT NOT NULL, resource TEXT NOT NULL, correlation_id TEXT NOT NULL, created_at TEXT NOT NULL);',
      'CREATE INDEX IF NOT EXISTS idx_sessions_expiry ON sessions(expires_at);',
      'CREATE INDEX IF NOT EXISTS idx_connections_active ON connections(active);',
    ].join('\n'),
  );
  return database;
}

export function closeDatabase(database: Database): void {
  database.close();
}
