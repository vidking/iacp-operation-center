import { mockSource } from "#lib/server/data/mock.ts";
import { freshness, uniqueEvents } from "#lib/types/observation.ts";
// Iteración visual: solo fixtures locales, incluso si existe configuración IACP.
// El adaptador real permanece desconectado de todas las rutas del portal.
export const load = async () => {
  const [operations, page, diagnostics] = await Promise.all([
    mockSource.operations(),
    mockSource.events(),
    mockSource.observability(),
  ]);
  return {
    mode: "MOCK",
    operations,
    events: uniqueEvents(page.events),
    diagnostics,
    freshness: freshness(diagnostics.observed_at),
    partial: false,
    blocked: false,
  };
};
