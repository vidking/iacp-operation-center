import { fail } from "@sveltejs/kit";
import {
  createManagedUser,
  listUsers,
  resetManagedUserPassword,
  updateManagedUser,
} from "#lib/server/security/auth.ts";
import { SecurityError } from "#lib/server/security/config.ts";

const messages: Record<string, string> = {
  INVALID_USERNAME:
    "El usuario debe tener entre 3 y 64 caracteres: letras minúsculas, números, punto, guion o guion bajo.",
  INVALID_DISPLAY_NAME: "El nombre visible contiene caracteres no permitidos.",
  INVALID_PASSWORD: "La contraseña debe tener entre 14 y 256 caracteres.",
  INVALID_ROLE: "Selecciona un rol válido.",
  INVALID_TENANT: "El workspace indicado no es válido.",
  INVALID_DISABLED: "El estado de la cuenta no es válido.",
  USERNAME_IN_USE: "Ese nombre de usuario ya existe en este workspace.",
  USER_NOT_FOUND: "La cuenta ya no existe en este workspace.",
  LAST_ADMIN_REQUIRED: "Debe permanecer al menos un Administrador activo.",
  PASSWORD_RESET_SEPARATE:
    "La contraseña se cambia desde “Restablecer contraseña”.",
  PASSWORD_RESET_CONFIRMATION_REQUIRED:
    "Confirma explícitamente el restablecimiento de contraseña.",
  PASSWORD_CONFIRMATION_MISMATCH: "Las contraseñas nuevas no coinciden.",
};

function actionError(error: unknown, fallback: string) {
  if (!(error instanceof SecurityError))
    return { error: fallback, message: "No fue posible guardar los cambios." };
  return {
    error: error.code,
    message: messages[error.code] ?? "No fue posible guardar los cambios.",
    ...(error.field ? { field: error.field } : {}),
  };
}

export const load = ({ locals }) => ({ users: listUsers(locals.user) });

export const actions = {
  default: async ({ locals }) => {
    const body = locals.body ?? {};
    try {
      if (body._action === "create") {
        await createManagedUser(locals.user, body);
        return { saved: true, created: true, users: listUsers(locals.user) };
      }
      if (body._action === "update") {
        await updateManagedUser(locals.user, body.id, body);
        return { saved: true, users: listUsers(locals.user) };
      }
      if (body._action === "reset-password") {
        await resetManagedUserPassword(locals.user, body.id, body);
        return {
          saved: true,
          passwordReset: true,
          users: listUsers(locals.user),
        };
      }
      throw new SecurityError("INVALID_REQUEST", 400);
    } catch (error) {
      return fail(
        error instanceof SecurityError ? error.status : 400,
        actionError(error, "USER_UPDATE_FAILED"),
      );
    }
  },
};
