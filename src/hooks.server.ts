import type { Handle } from "@sveltejs/kit/hooks";
export const handle: Handle = async ({ event, resolve }) => {
  // No se confía en cabeceras o cookies para poblar locals.observer.
  // Integración de identidad pendiente: IACP falla cerrado hasta autenticar sesión.
  const response = await resolve(event);
  response.headers.set("Cache-Control", "private, no-store");
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Referrer-Policy", "same-origin");
  response.headers.set("Content-Security-Policy", "frame-ancestors 'none'");
  return response;
};
