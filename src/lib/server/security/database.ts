import { DatabaseSync } from "node:sqlite";
import { mkdirSync, chmodSync } from "node:fs";
import { dirname } from "node:path";
import { randomUUID } from "node:crypto";
import { config } from "./config.ts";
let database: DatabaseSync | undefined;
let path: string | undefined;
export function db() {
  const target = config().dbPath;
  if (database && path === target) return database;
  if (database) database.close();
  process.umask(0o077);
  mkdirSync(dirname(target), { recursive: true, mode: 0o700 });
  chmodSync(dirname(target), 0o700);
  database = new DatabaseSync(target);
  chmodSync(target, 0o600);
  path = target;
  database.exec(`PRAGMA journal_mode=WAL;PRAGMA synchronous=FULL;PRAGMA foreign_keys=ON;PRAGMA busy_timeout=5000;PRAGMA secure_delete=ON;
 CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY,username TEXT NOT NULL UNIQUE,display_name TEXT NOT NULL DEFAULT '',password_hash TEXT NOT NULL,role TEXT NOT NULL CHECK(role IN ('Viewer','Operator','Administrator')),tenant_id TEXT NOT NULL,disabled INTEGER NOT NULL DEFAULT 0);
 CREATE TABLE IF NOT EXISTS sessions(id_hash TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,csrf TEXT NOT NULL,created_at INTEGER NOT NULL,last_seen INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS attempts(bucket TEXT PRIMARY KEY,count INTEGER NOT NULL,expires INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS connections(id TEXT PRIMARY KEY,name TEXT NOT NULL,environment TEXT NOT NULL,endpoint TEXT NOT NULL,tenant_id TEXT NOT NULL,service_identity TEXT NOT NULL,secret TEXT NOT NULL,credential_version INTEGER NOT NULL DEFAULT 1,enabled INTEGER NOT NULL DEFAULT 1,updated_at TEXT NOT NULL,last_validation TEXT,last_code TEXT,validated_version INTEGER);
 CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY,value TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS snapshots(connection_id TEXT PRIMARY KEY REFERENCES connections(id) ON DELETE CASCADE,version INTEGER NOT NULL,payload TEXT NOT NULL,saved_at TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS crm_intents(id TEXT PRIMARY KEY,workspace TEXT NOT NULL,connection_id TEXT NOT NULL,remote_tenant TEXT NOT NULL,actor TEXT NOT NULL,action TEXT NOT NULL,instance_id TEXT,payload_hash TEXT NOT NULL,status TEXT NOT NULL,operation_id TEXT,error_code TEXT,created_at TEXT NOT NULL,updated_at TEXT NOT NULL,diagnostic TEXT);
 CREATE TABLE IF NOT EXISTS audit(id TEXT PRIMARY KEY,occurred_at TEXT NOT NULL,actor TEXT NOT NULL,action TEXT NOT NULL,object_id TEXT NOT NULL,tenant_id TEXT NOT NULL,detail TEXT NOT NULL);
 CREATE TRIGGER IF NOT EXISTS audit_no_update BEFORE UPDATE ON audit BEGIN SELECT RAISE(ABORT,'append only');END;
 CREATE TRIGGER IF NOT EXISTS audit_no_delete BEFORE DELETE ON audit BEGIN SELECT RAISE(ABORT,'append only');END;
 PRAGMA user_version=1;`);
  const userColumns = database.prepare("PRAGMA table_info(users)").all() as {
    name?: string;
  }[];
  if (!userColumns.some((column) => column.name === "display_name")) {
    database.exec(
      "ALTER TABLE users ADD COLUMN display_name TEXT NOT NULL DEFAULT ''",
    );
  }
  const intentColumns = database
    .prepare("PRAGMA table_info(crm_intents)")
    .all() as { name?: string }[];
  if (!intentColumns.some((column) => column.name === "diagnostic"))
    database.exec("ALTER TABLE crm_intents ADD COLUMN diagnostic TEXT");
  if (!intentColumns.some((column) => column.name === "remote_scope")) {
    database.exec("ALTER TABLE crm_intents ADD COLUMN remote_scope TEXT");
    database.exec(
      "UPDATE crm_intents SET remote_scope=remote_tenant WHERE remote_scope IS NULL",
    );
  }
  return database;
}
export function transaction<T>(fn: () => T): T {
  const database = db();
  database.exec("BEGIN IMMEDIATE");
  try {
    const result = fn();
    database.exec("COMMIT");
    return result;
  } catch (e) {
    database.exec("ROLLBACK");
    throw e;
  }
}
export function audit(
  actor: string,
  action: string,
  objectId: string,
  tenantId: string,
  detail: Record<string, string | number | boolean> = {},
) {
  db()
    .prepare("INSERT INTO audit VALUES(?,?,?,?,?,?,?)")
    .run(
      randomUUID(),
      new Date().toISOString(),
      actor,
      action,
      objectId,
      tenantId,
      JSON.stringify(detail),
    );
}
export function setting(key: string) {
  return (
    db().prepare("SELECT value FROM settings WHERE key=?").get(key) as
      { value: string } | undefined
  )?.value;
}
export function setSetting(key: string, value: string) {
  db()
    .prepare(
      "INSERT INTO settings VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
    )
    .run(key, value);
}
