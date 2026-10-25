import { fail, redirect } from "@sveltejs/kit";
import {
  opaque,
  loginCookie,
  sessionCookie,
  cookieOptions,
  login,
  logout,
} from "#lib/server/security/auth.ts";
import { SecurityError } from "#lib/server/security/config.ts";
export const load = ({ cookies, locals }) => {
  if (locals.user) redirect(303, "/");
  const csrf = opaque();
  cookies.set(loginCookie, csrf, {
    ...cookieOptions,
    sameSite: "strict",
    maxAge: 600,
  });
  return { loginCsrf: csrf };
};
export const actions = {
  default: async ({ locals, cookies, getClientAddress }) => {
    const body = locals.body ?? {},
      username = body.username,
      password = body.password;
    if (
      typeof username !== "string" ||
      typeof password !== "string" ||
      username.length > 64 ||
      password.length > 256 ||
      !username ||
      !password
    )
      return fail(400, { error: "Credenciales no válidas." });
    try {
      const current = await login(username, password, getClientAddress());
      logout(cookies.get(sessionCookie));
      cookies.set(sessionCookie, current.token, {
        ...cookieOptions,
        maxAge: 8 * 3600,
      });
      cookies.delete(loginCookie, { path: "/" });
    } catch (e) {
      return fail(e instanceof SecurityError ? e.status : 500, {
        error:
          e instanceof SecurityError && e.status === 429
            ? "Demasiados intentos. Espera antes de volver a intentarlo."
            : "No fue posible iniciar sesión con esas credenciales.",
      });
    }
    redirect(303, "/");
  },
};
