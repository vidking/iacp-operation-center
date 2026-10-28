import { hash, verify } from "@node-rs/argon2";
import {
  createHash,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";
import { db, audit, transaction } from "./database.ts";
import { SecurityError } from "./config.ts";
import type { Principal, Role } from "../../types/security.ts";
import type { UserView } from "../../types/security.ts";
export const sessionCookie = "__Host-iacoc-session";
export const loginCookie = "__Host-iacoc-login";
export const cookieOptions = {
  path: "/",
  httpOnly: true,
  secure: true,
  sameSite: "lax" as const,
};
export const opaque = () => randomBytes(32).toString("base64url");
const digest = (value: string) =>
  createHash("sha256").update(value).digest("hex");
const options = {
  algorithm: 2 as const,
  memoryCost: 65536,
  timeCost: 3,
  parallelism: 1,
  outputLen: 32,
};
export const passwordHash = (password: string) => hash(password, options);
export function equal(a: string, b: string) {
  const x = Buffer.from(a),
    y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
interface UserRow {
  id: string;
  username: string;
  display_name: string;
  role: Role;
  tenant_id: string;
  password_hash: string;
  disabled: number;
}
function principal(row: UserRow): Principal {
  return {
    id: row.id,
    username: row.username,
    displayName: row.display_name || row.username,
    role: row.role,
    tenantId: row.tenant_id,
  };
}
const usernamePattern = /^[a-z0-9._-]{3,64}$/;
const displayNamePattern = /^[\p{L}\p{N} ._()\-]{1,100}$/u;
const roleValues: Role[] = ["Viewer", "Operator", "Administrator"];
function normalizedUsername(value: unknown) {
  if (typeof value !== "string")
    throw new SecurityError("INVALID_USERNAME", 400, "username");
  const username = value.trim().toLowerCase();
  if (!usernamePattern.test(username))
    throw new SecurityError("INVALID_USERNAME", 400, "username");
  return username;
}
function normalizedDisplayName(value: unknown, fallback: string) {
  if (value === undefined || value === null || value === "") return fallback;
  if (typeof value !== "string")
    throw new SecurityError("INVALID_DISPLAY_NAME", 400, "displayName");
  const displayName = value.trim();
  if (!displayNamePattern.test(displayName))
    throw new SecurityError("INVALID_DISPLAY_NAME", 400, "displayName");
  return displayName;
}
function normalizedPassword(value: unknown, field = "password") {
  if (typeof value !== "string")
    throw new SecurityError("INVALID_PASSWORD", 400, field);
  if (value.length < 14 || value.length > 256)
    throw new SecurityError("INVALID_PASSWORD", 400, field);
  return value;
}
function normalizedRole(value: unknown, field = "role") {
  if (!roleValues.includes(value as Role))
    throw new SecurityError("INVALID_ROLE", 400, field);
  return value as Role;
}
function normalizedTenant(value: unknown) {
  if (typeof value !== "string" || !/^[a-zA-Z0-9_-]{1,64}$/.test(value))
    throw new SecurityError("INVALID_TENANT", 400, "tenantId");
  return value;
}
function normalizedDisabled(value: unknown, fallback: boolean) {
  if (value === undefined) return fallback;
  if (value === true || value === "true" || value === "on") return true;
  if (value === false || value === "false") return false;
  throw new SecurityError("INVALID_DISABLED", 400, "disabled");
}
function userView(
  row: UserRow & { last_activity?: number | string | null },
): UserView {
  return {
    id: row.id,
    username: row.username,
    displayName: row.display_name || row.username,
    role: row.role,
    tenantId: row.tenant_id,
    disabled: Boolean(row.disabled),
    lastActivity:
      typeof row.last_activity === "number"
        ? new Date(row.last_activity).toISOString()
        : (row.last_activity ?? null),
  };
}
function rowForId(id: string, tenantId?: string) {
  return db()
    .prepare(
      tenantId
        ? "SELECT * FROM users WHERE id=? AND tenant_id=?"
        : "SELECT * FROM users WHERE id=?",
    )
    .get(...(tenantId ? [id, tenantId] : [id])) as unknown as
    UserRow | undefined;
}
function ensureAdminRemains(
  tenantId: string,
  target: UserRow,
  role: Role,
  disabled: boolean,
) {
  if (
    target.role !== "Administrator" ||
    (!disabled && role === "Administrator")
  )
    return;
  const row = db()
    .prepare(
      "SELECT count(*) AS total FROM users WHERE tenant_id=? AND role='Administrator' AND disabled=0 AND id<>?",
    )
    .get(tenantId, target.id) as { total: number };
  if (row.total < 1) throw new SecurityError("LAST_ADMIN_REQUIRED", 409);
}
export function requireRole(
  user: Principal | undefined,
  roles: Role[] = ["Viewer", "Operator", "Administrator"],
): Principal {
  if (!user) throw new SecurityError("AUTHENTICATION_REQUIRED", 401);
  if (!roles.includes(user.role)) throw new SecurityError("FORBIDDEN", 403);
  return user;
}
export async function createUser(
  username: string,
  password: string,
  role: Role,
  tenantId: string,
  actor = "local-cli",
  displayName?: string,
) {
  const normalized = normalizedUsername(username);
  const visible = normalizedDisplayName(displayName, normalized);
  const safePassword = normalizedPassword(password);
  const safeRole = normalizedRole(role);
  const safeTenant = normalizedTenant(tenantId);
  const id = randomUUID(),
    hashed = await passwordHash(safePassword);
  transaction(() => {
    db()
      .prepare(
        "INSERT INTO users(id,username,display_name,password_hash,role,tenant_id) VALUES(?,?,?,?,?,?)",
      )
      .run(id, normalized, visible, hashed, safeRole, safeTenant);
    audit(actor, "user.created", id, safeTenant, { role: safeRole });
  });
  return id;
}
export async function changeUser(
  username: string,
  change: { password?: string; role?: Role; disabled?: boolean },
  actor = "local-cli",
) {
  const row = db()
    .prepare("SELECT * FROM users WHERE username=?")
    .get(username.trim().toLowerCase()) as unknown as UserRow | undefined;
  if (!row) throw new SecurityError("USER_NOT_FOUND", 404);
  if (change.role) normalizedRole(change.role);
  if (change.password) normalizedPassword(change.password);
  const disabled = normalizedDisabled(change.disabled, Boolean(row.disabled));
  const hashed = change.password
    ? await passwordHash(change.password)
    : row.password_hash;
  transaction(() => {
    ensureAdminRemains(row.tenant_id, row, change.role ?? row.role, disabled);
    db()
      .prepare("UPDATE users SET password_hash=?,role=?,disabled=? WHERE id=?")
      .run(hashed, change.role ?? row.role, Number(disabled), row.id);
    db().prepare("DELETE FROM sessions WHERE user_id=?").run(row.id);
    audit(actor, "user.changed", row.id, row.tenant_id, {
      passwordChanged: Boolean(change.password),
      role: change.role ?? row.role,
      disabled,
    });
  });
}

export function currentUser(user: Principal | undefined): UserView {
  const actor = requireRole(user);
  const row = rowForId(actor.id, actor.tenantId);
  if (!row) throw new SecurityError("USER_NOT_FOUND", 404);
  return userView(row);
}

export function listUsers(user: Principal | undefined): UserView[] {
  const actor = requireRole(user, ["Administrator"]);
  return (
    db()
      .prepare(
        "SELECT u.*, MAX(s.last_seen) AS last_activity FROM users u LEFT JOIN sessions s ON s.user_id=u.id WHERE u.tenant_id=? GROUP BY u.id ORDER BY u.display_name COLLATE NOCASE, u.username COLLATE NOCASE",
      )
      .all(actor.tenantId) as unknown as (UserRow & {
      last_activity?: number | string | null;
    })[]
  ).map(userView);
}

export async function updateOwnProfile(
  user: Principal | undefined,
  input: {
    displayName?: unknown;
    username?: unknown;
    currentPassword?: unknown;
    newPassword?: unknown;
  },
) {
  const actor = requireRole(user);
  const row = rowForId(actor.id, actor.tenantId);
  if (!row) throw new SecurityError("USER_NOT_FOUND", 404);
  const username =
    input.username === undefined
      ? row.username
      : normalizedUsername(input.username);
  const displayName = normalizedDisplayName(
    input.displayName,
    row.display_name || row.username,
  );
  const wantsPassword =
    input.newPassword !== undefined && input.newPassword !== "";
  if (wantsPassword) {
    if (typeof input.currentPassword !== "string" || !input.currentPassword)
      throw new SecurityError("CURRENT_PASSWORD_REQUIRED", 400);
    if (!(await verify(row.password_hash, input.currentPassword)))
      throw new SecurityError("CURRENT_PASSWORD_INVALID", 403);
    if (
      typeof input.newPassword !== "string" ||
      input.newPassword.length < 14 ||
      input.newPassword.length > 256
    )
      throw new SecurityError("INVALID_PASSWORD", 400);
  }
  if (username !== row.username) {
    const duplicate = db()
      .prepare("SELECT id FROM users WHERE username=? AND id<>?")
      .get(username, row.id);
    if (duplicate) throw new SecurityError("USERNAME_IN_USE", 409);
  }
  const hashed = wantsPassword
    ? await passwordHash(input.newPassword as string)
    : row.password_hash;
  transaction(() => {
    db()
      .prepare(
        "UPDATE users SET username=?,display_name=?,password_hash=? WHERE id=? AND tenant_id=?",
      )
      .run(username, displayName, hashed, row.id, actor.tenantId);
    if (wantsPassword)
      db().prepare("DELETE FROM sessions WHERE user_id=?").run(row.id);
    audit(actor.id, "user.profile_updated", row.id, actor.tenantId, {
      usernameChanged: username !== row.username,
      displayNameChanged: displayName !== (row.display_name || row.username),
      passwordChanged: wantsPassword,
    });
  });
  return currentUser({ ...actor, username, displayName });
}

export async function createManagedUser(
  user: Principal | undefined,
  input: Record<string, unknown>,
) {
  const actor = requireRole(user, ["Administrator"]);
  const username = normalizedUsername(input.username);
  const displayName = normalizedDisplayName(input.displayName, username);
  const password = normalizedPassword(input.password);
  const role = normalizedRole(input.role);
  try {
    const id = await createUser(
      username,
      password,
      role,
      actor.tenantId,
      actor.id,
      displayName,
    );
    return currentUser({ ...actor, id });
  } catch (error) {
    if (error instanceof Error && /UNIQUE|constraint/i.test(error.message))
      throw new SecurityError("USERNAME_IN_USE", 409);
    throw error;
  }
}

export async function resetManagedUserPassword(
  user: Principal | undefined,
  id: unknown,
  input: Record<string, unknown>,
) {
  const actor = requireRole(user, ["Administrator"]);
  if (typeof id !== "string" || !/^[a-zA-Z0-9-]{36}$/.test(id))
    throw new SecurityError("INVALID_USER", 400, "id");
  const row = rowForId(id, actor.tenantId);
  if (!row) throw new SecurityError("USER_NOT_FOUND", 404);
  if (input.confirmReset !== true && input.confirmReset !== "true")
    throw new SecurityError(
      "PASSWORD_RESET_CONFIRMATION_REQUIRED",
      409,
      "confirmReset",
    );
  const password = normalizedPassword(input.newPassword, "newPassword");
  if (password !== input.confirmPassword)
    throw new SecurityError(
      "PASSWORD_CONFIRMATION_MISMATCH",
      400,
      "confirmPassword",
    );
  const hashed = await passwordHash(password);
  transaction(() => {
    db()
      .prepare("UPDATE users SET password_hash=? WHERE id=? AND tenant_id=?")
      .run(hashed, row.id, actor.tenantId);
    db().prepare("DELETE FROM sessions WHERE user_id=?").run(row.id);
    audit(actor.id, "user.password_reset", row.id, actor.tenantId, {
      passwordChanged: true,
    });
  });
  return userView(rowForId(row.id, actor.tenantId)!);
}

export async function updateManagedUser(
  user: Principal | undefined,
  id: unknown,
  input: Record<string, unknown>,
) {
  const actor = requireRole(user, ["Administrator"]);
  if (typeof id !== "string" || !/^[a-zA-Z0-9-]{36}$/.test(id))
    throw new SecurityError("INVALID_USER", 400);
  const row = rowForId(id, actor.tenantId);
  if (!row) throw new SecurityError("USER_NOT_FOUND", 404);
  const username =
    input.username === undefined
      ? row.username
      : normalizedUsername(input.username);
  const displayName = normalizedDisplayName(
    input.displayName,
    row.display_name || row.username,
  );
  const role = input.role === undefined ? row.role : input.role;
  normalizedRole(role);
  const disabled = normalizedDisabled(input.disabled, Boolean(row.disabled));
  ensureAdminRemains(actor.tenantId, row, role as Role, disabled);
  if (
    username !== row.username &&
    db()
      .prepare("SELECT id FROM users WHERE username=? AND id<>?")
      .get(username, row.id)
  )
    throw new SecurityError("USERNAME_IN_USE", 409);
  if (input.password !== undefined && input.password !== "")
    throw new SecurityError("PASSWORD_RESET_SEPARATE", 409, "password");
  const hashed = row.password_hash;
  transaction(() => {
    db()
      .prepare(
        "UPDATE users SET username=?,display_name=?,password_hash=?,role=?,disabled=? WHERE id=? AND tenant_id=?",
      )
      .run(
        username,
        displayName,
        hashed,
        role as Role,
        Number(disabled),
        row.id,
        actor.tenantId,
      );
    if (disabled && !row.disabled)
      db().prepare("DELETE FROM sessions WHERE user_id=?").run(row.id);
    audit(actor.id, "user.administration_updated", row.id, actor.tenantId, {
      usernameChanged: username !== row.username,
      roleChanged: role !== row.role,
      disabled,
      passwordReset: false,
    });
  });
  return currentUser({ ...actor, id: row.id, username, displayName });
}

export function roleLabel(role: Role) {
  return role === "Viewer"
    ? "Lector"
    : role === "Operator"
      ? "Operador"
      : "Administrador";
}
export function throttle(
  key: string,
  limit: number,
  windowMs: number,
  now = Date.now(),
) {
  transaction(() => {
    db().prepare("DELETE FROM attempts WHERE expires<?").run(now);
    const bucket = digest(key);
    const row = db()
      .prepare("SELECT count FROM attempts WHERE bucket=?")
      .get(bucket) as { count: number } | undefined;
    if (row && row.count >= limit)
      throw new SecurityError("TOO_MANY_ATTEMPTS", 429);
    db()
      .prepare(
        "INSERT INTO attempts VALUES(?,1,?) ON CONFLICT(bucket) DO UPDATE SET count=count+1",
      )
      .run(bucket, now + windowMs);
  });
}
// Solo proveedores de identidad confiables llaman a este puerto server-side.
// expectedHash cierra la carrera entre verificar una contraseña y revocarla por CLI.
export function createSessionForUser(userId: string, expectedHash?: string) {
  const token = opaque(),
    csrf = opaque(),
    now = Date.now();
  const user = transaction(() => {
    const current = db()
      .prepare("SELECT * FROM users WHERE id=?")
      .get(userId) as unknown as UserRow | undefined;
    if (
      !current ||
      current.disabled ||
      (expectedHash !== undefined && current.password_hash !== expectedHash)
    )
      throw new SecurityError("INVALID_CREDENTIALS", 401);
    db()
      .prepare("DELETE FROM sessions WHERE created_at<? OR last_seen<?")
      .run(now - 8 * 3600_000, now - 1800_000);
    db()
      .prepare("INSERT INTO sessions VALUES(?,?,?,?,?)")
      .run(digest(token), current.id, csrf, now, now);
    audit(current.id, "auth.login", current.id, current.tenant_id);
    return principal(current);
  });
  return { token, csrf, user };
}
let dummy: Promise<string> | undefined;
let hashing = 0;
export async function login(
  username: string,
  password: string,
  address: string,
) {
  username = username.trim().toLowerCase();
  throttle("login-global", 60, 60_000);
  throttle("login-ip:" + address, 15, 900_000);
  throttle("login-user:" + username, 8, 900_000);
  if (hashing >= 4) throw new SecurityError("TOO_MANY_ATTEMPTS", 429);
  hashing++;
  try {
    const row = db()
      .prepare("SELECT * FROM users WHERE username=?")
      .get(username) as unknown as UserRow | undefined;
    dummy ??= passwordHash(opaque());
    const encoded = row?.password_hash ?? (await dummy);
    let valid = false;
    try {
      valid = await verify(encoded, password);
    } catch {
      /* generic failure */
    }
    if (!valid || !row || row.disabled) {
      audit("anonymous", "auth.failed", "login", "", {});
      throw new SecurityError("INVALID_CREDENTIALS", 401);
    }
    return createSessionForUser(row.id, encoded);
  } finally {
    hashing--;
  }
}
export function session(token: string | undefined, now = Date.now()) {
  if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
  const row = db()
    .prepare(
      "SELECT u.*,s.csrf,s.created_at,s.last_seen FROM sessions s JOIN users u ON s.user_id=u.id WHERE s.id_hash=?",
    )
    .get(digest(token)) as unknown as
    | (UserRow & { csrf: string; created_at: number; last_seen: number })
    | undefined;
  if (!row) return null;
  if (
    row.disabled ||
    now - row.created_at > 8 * 3600_000 ||
    now - row.last_seen > 1800_000
  ) {
    db().prepare("DELETE FROM sessions WHERE id_hash=?").run(digest(token));
    return null;
  }
  if (now - row.last_seen > 30_000)
    db()
      .prepare("UPDATE sessions SET last_seen=? WHERE id_hash=?")
      .run(now, digest(token));
  return {
    user: principal(row),
    csrf: row.csrf,
    expires: new Date(row.created_at + 8 * 3600_000),
  };
}
export function logout(token: string | undefined) {
  if (!token) return;
  transaction(() => {
    const current = session(token);
    db().prepare("DELETE FROM sessions WHERE id_hash=?").run(digest(token));
    if (current)
      audit(
        current.user.id,
        "auth.logout",
        current.user.id,
        current.user.tenantId,
      );
  });
}
