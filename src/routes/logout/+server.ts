import { redirect } from "@sveltejs/kit";
import { logout, sessionCookie } from "#lib/server/security/auth.ts";
export const POST = ({ cookies }) => {
  logout(cookies.get(sessionCookie));
  cookies.delete(sessionCookie, { path: "/" });
  redirect(303, "/login");
};
