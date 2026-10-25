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
  role: Role;
  tenant_id: string;
  password_hash: string;
  disabled: number;
}
function principal(row: UserRow): Principal {
  return {
    id: row.id,
    username: row.username,
    role: row.role,
    tenantId: row.tenant_id,
  };
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
) {
  if (
    !/^[a-z0-9._-]{3,64}$/.test(username) ||
    password.length < 14 ||
    password.length > 256 ||
    !["Viewer", "Operator", "Administrator"].includes(role) ||
    !/^[a-zA-Z0-9_-]{1,64}$/.test(tenantId)
  )
    throw new SecurityError("INVALID_USER");
  const id = randomUUID(),
    hashed = await passwordHash(password);
  transaction(() => {
    db()
      .prepare(
        "INSERT INTO users(id,username,password_hash,role,tenant_id) VALUES(?,?,?,?,?)",
      )
      .run(id, username, hashed, role, tenantId);
    audit(actor, "user.created", id, tenantId, { role });
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
    .get(username) as unknown as UserRow | undefined;
  if (!row) throw new SecurityError("USER_NOT_FOUND", 404);
  if (
    change.role &&
    !["Viewer", "Operator", "Administrator"].includes(change.role)
  )
    throw new SecurityError("INVALID_ROLE");
  if (
    change.password &&
    (change.password.length < 14 || change.password.length > 256)
  )
    throw new SecurityError("INVALID_PASSWORD");
  const hashed = change.password
    ? await passwordHash(change.password)
    : row.password_hash;
  transaction(() => {
    db()
      .prepare("UPDATE users SET password_hash=?,role=?,disabled=? WHERE id=?")
      .run(
        hashed,
        change.role ?? row.role,
        change.disabled === undefined ? row.disabled : Number(change.disabled),
        row.id,
      );
    db().prepare("DELETE FROM sessions WHERE user_id=?").run(row.id);
    audit(actor, "user.changed", row.id, row.tenant_id, {
      passwordChanged: Boolean(change.password),
      role: change.role ?? row.role,
      disabled: change.disabled ?? Boolean(row.disabled),
    });
  });
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
  username = username.toLowerCase();
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
