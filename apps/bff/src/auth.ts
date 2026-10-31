import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type { Database } from './db';
import { hash, verify } from '@node-rs/argon2';
import type {
  ConnectionGrant,
  Density,
  FontScale,
  Role,
  Settings,
  Theme,
  User,
} from '@iacoc/contracts';

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

type UserListRow = {
  id: string;
  username: string;
  role: Role;
  tenant: string;
  created_at: string;
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
): Promise<string> {
  const passwordHash = await hash(password, argonOptions);
  const id = randomUUID();
  database
    .prepare(
      'INSERT INTO users (id, username, password_hash, role, tenant, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    )
    .run(id, username, passwordHash, role, tenant, new Date().toISOString());
  return id;
}

export function listUsers(database: Database): User[] {
  const rows = database
    .prepare('SELECT id, username, role, tenant, created_at FROM users ORDER BY username')
    .all() as unknown as UserListRow[];
  return rows.map((row) => ({
    id: row.id,
    username: row.username,
    role: row.role,
    tenant: row.tenant,
    createdAt: row.created_at,
    grants: listUserGrants(database, row.id),
  }));
}

export function getUser(database: Database, id: string): User | null {
  const row = database
    .prepare('SELECT id, username, role, tenant, created_at FROM users WHERE id = ?')
    .get(id) as UserListRow | undefined;
  if (!row) return null;
  return {
    id: row.id,
    username: row.username,
    role: row.role,
    tenant: row.tenant,
    createdAt: row.created_at,
    grants: listUserGrants(database, row.id),
  };
}

export function listUserGrants(database: Database, userId: string): ConnectionGrant[] {
  const rows = database
    .prepare(
      'SELECT connection_id, can_read, can_operate FROM connection_grants WHERE user_id = ? ORDER BY connection_id',
    )
    .all(userId) as Array<{
    connection_id: string;
    can_read: number;
    can_operate: number;
  }>;
  return rows.map((row) => ({
    connectionId: row.connection_id,
    canRead: row.can_read === 1,
    canOperate: row.can_operate === 1,
  }));
}

export function replaceUserGrants(database: Database, userId: string, grants: ConnectionGrant[]) {
  database.prepare('DELETE FROM connection_grants WHERE user_id = ?').run(userId);
  const insert = database.prepare(
    'INSERT INTO connection_grants (connection_id, user_id, can_read, can_operate, created_at) VALUES (?, ?, ?, ?, ?)',
  );
  for (const grant of grants) {
    if (!grant.canRead && !grant.canOperate) continue;
    insert.run(
      grant.connectionId,
      userId,
      grant.canRead || grant.canOperate ? 1 : 0,
      grant.canOperate ? 1 : 0,
      new Date().toISOString(),
    );
  }
}

export async function updateUser(
  database: Database,
  id: string,
  input: { password?: string; role?: Role; tenant?: string; grants?: ConnectionGrant[] },
): Promise<User | null> {
  const existing = database
    .prepare('SELECT id, username, password_hash, role, tenant, created_at FROM users WHERE id = ?')
    .get(id) as (UserListRow & { password_hash: string }) | undefined;
  if (!existing) return null;
  const passwordHash = input.password
    ? await hash(input.password, argonOptions)
    : existing.password_hash;
  database
    .prepare('UPDATE users SET password_hash = ?, role = ?, tenant = ? WHERE id = ?')
    .run(passwordHash, input.role ?? existing.role, input.tenant ?? existing.tenant, id);
  if (input.grants) replaceUserGrants(database, id, input.grants);
  return getUser(database, id);
}

export function getSettings(database: Database, userId: string): Settings {
  const row = database
    .prepare(
      'SELECT theme, font_scale, density, reduced_motion FROM user_settings WHERE user_id = ?',
    )
    .get(userId) as
    { theme: Theme; font_scale: FontScale; density: Density; reduced_motion: number } | undefined;
  return {
    theme: row?.theme ?? 'graphite',
    fontScale: row?.font_scale ?? 'normal',
    density: row?.density ?? 'comfortable',
    reducedMotion: row?.reduced_motion === 1,
  };
}

export function updateSettings(
  database: Database,
  userId: string,
  input: Partial<Settings>,
): Settings {
  const current = getSettings(database, userId);
  const next = {
    theme: input.theme ?? current.theme,
    fontScale: input.fontScale ?? current.fontScale,
    density: input.density ?? current.density,
    reducedMotion: input.reducedMotion ?? current.reducedMotion,
  };
  database
    .prepare(
      'INSERT INTO user_settings (user_id, theme, font_scale, density, reduced_motion, updated_at) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET theme = excluded.theme, font_scale = excluded.font_scale, density = excluded.density, reduced_motion = excluded.reduced_motion, updated_at = excluded.updated_at',
    )
    .run(
      userId,
      next.theme,
      next.fontScale,
      next.density,
      next.reducedMotion ? 1 : 0,
      new Date().toISOString(),
    );
  return next;
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
