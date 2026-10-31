import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type { Database } from './db';
import { hash, verify } from '@node-rs/argon2';
import type { Role } from '@iacoc/contracts';

const SESSION_TTL_MS = 8 * 60 * 60 * 1000;
const argonOptions = {
  memoryCost: 19 * 1024,
  timeCost: 2,
  parallelism: 1,
};

export type SessionUser = {
  id: string;
  username: string;
  role: Role;
  tenant: string;
  csrfToken: string;
};

type UserRow = {
  id: string;
  username: string;
  password_hash: string;
  role: Role;
  tenant: string;
};

type SessionRow = UserRow & {
  csrf_hash: string;
  expires_at: string;
};

function digest(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export async function createUser(
  database: Database,
  username: string,
  password: string,
  role: Role,
  tenant: string,
): Promise<void> {
  const passwordHash = await hash(password, argonOptions);
  database
    .prepare(
      'INSERT INTO users (id, username, password_hash, role, tenant, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    )
    .run(randomUUID(), username, passwordHash, role, tenant, new Date().toISOString());
}

export async function authenticateUser(
  database: Database,
  username: string,
  password: string,
): Promise<Omit<SessionUser, 'csrfToken'> | null> {
  const row = database
    .prepare('SELECT id, username, password_hash, role, tenant FROM users WHERE username = ?')
    .get(username) as UserRow | undefined;
  if (!row || !(await verify(row.password_hash, password))) {
    return null;
  }
  return {
    id: row.id,
    username: row.username,
    role: row.role,
    tenant: row.tenant,
  };
}

export function createSession(
  database: Database,
  user: Omit<SessionUser, 'csrfToken'>,
): { token: string; csrfToken: string; expiresAt: string } {
  const token = randomBytes(32).toString('base64url');
  const csrfToken = randomBytes(24).toString('base64url');
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString();
  database
    .prepare(
      'INSERT INTO sessions (token_hash, user_id, csrf_hash, expires_at, created_at) VALUES (?, ?, ?, ?, ?)',
    )
    .run(digest(token), user.id, digest(csrfToken), expiresAt, new Date().toISOString());
  return { token, csrfToken, expiresAt };
}

export function findSession(database: Database, token: string): SessionUser | null {
  const row = database
    .prepare(
      'SELECT u.id, u.username, u.password_hash, u.role, u.tenant, s.csrf_hash, s.expires_at FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ?',
    )
    .get(digest(token)) as SessionRow | undefined;
  if (!row || Date.parse(row.expires_at) <= Date.now()) {
    if (row) {
      database.prepare('DELETE FROM sessions WHERE token_hash = ?').run(digest(token));
    }
    return null;
  }
  return {
    id: row.id,
    username: row.username,
    role: row.role,
    tenant: row.tenant,
    csrfToken: '',
  };
}

export function verifyCsrf(database: Database, token: string, csrfToken: string): boolean {
  const row = database
    .prepare('SELECT csrf_hash, expires_at FROM sessions WHERE token_hash = ?')
    .get(digest(token)) as { csrf_hash: string; expires_at: string } | undefined;
  return Boolean(
    row && Date.parse(row.expires_at) > Date.now() && row.csrf_hash === digest(csrfToken),
  );
}

export function destroySession(database: Database, token: string): void {
  database.prepare('DELETE FROM sessions WHERE token_hash = ?').run(digest(token));
}
