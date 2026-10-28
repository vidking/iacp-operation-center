import { z } from "zod";
import { audit, db, setting } from "./database.ts";
import { requireRole } from "./auth.ts";
import type { Principal } from "../../types/security.ts";

export const defaultPreferences = {
  workspaceName: "Cyberfuel",
  timeZone: "America/Costa_Rica",
  pageSize: 50 as 25 | 50 | 100,
  refreshInterval: 4 as 4 | 10 | 30 | 60,
  notifications: true,
};

const preferencesSchema = z
  .object({
    workspaceName: z
      .string()
      .trim()
      .min(2)
      .max(80)
      .regex(/^[\p{L}\p{N} ._()\-]+$/u),
    timeZone: z.enum([
      "America/Costa_Rica",
      "UTC",
      "America/New_York",
      "America/Los_Angeles",
      "Europe/Madrid",
    ]),
    pageSize: z.coerce
      .number()
      .refine((value) => [25, 50, 100].includes(value)),
    refreshInterval: z.coerce
      .number()
      .refine((value) => [4, 10, 30, 60].includes(value)),
    notifications: z
      .union([z.boolean(), z.string()])
      .optional()
      .transform(
        (value) => value === true || value === "true" || value === "on",
      ),
  })
  .strict();

const workspaceKey = (tenantId: string) => `preferences:workspace:${tenantId}`;
const userKey = (tenantId: string, userId: string) =>
  `preferences:user:${tenantId}:${userId}`;

function readJson(key: string): Record<string, unknown> {
  const value = setting(key);
  if (!value) return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export function getPreferences(user: Principal | undefined) {
  const actor = requireRole(user);
  const workspace = readJson(workspaceKey(actor.tenantId));
  const personal = readJson(userKey(actor.tenantId, actor.id));
  return {
    ...defaultPreferences,
    ...workspace,
    ...personal,
  };
}

export function updatePreferences(user: Principal | undefined, input: unknown) {
  const actor = requireRole(user, ["Administrator"]);
  const value = preferencesSchema.parse(input);
  const current = getPreferences(actor);
  const workspace = {
    workspaceName: value.workspaceName,
  };
  const personal = {
    timeZone: value.timeZone,
    pageSize: value.pageSize,
    refreshInterval: value.refreshInterval,
    notifications: value.notifications,
  };
  db()
    .prepare(
      "INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
    )
    .run(workspaceKey(actor.tenantId), JSON.stringify(workspace));
  db()
    .prepare(
      "INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
    )
    .run(userKey(actor.tenantId, actor.id), JSON.stringify(personal));
  audit(actor.id, "preferences.updated", actor.tenantId, actor.tenantId, {
    workspaceNameChanged: current.workspaceName !== value.workspaceName,
    timeZone: value.timeZone,
    pageSize: value.pageSize,
    refreshInterval: value.refreshInterval,
  });
  return getPreferences(actor);
}
