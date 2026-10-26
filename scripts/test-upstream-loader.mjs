// Solo laboratorio Playwright. No se copia ni se importa desde la imagen production.
// Hook documentado: https://nodejs.org/download/release/v22.23.0/docs/api/module.html
import { registerHooks } from "node:module";
import { pathToFileURL } from "node:url";
const fixture = JSON.stringify(
  pathToFileURL(process.cwd() + "/scripts/test-upstream.mjs").href,
);
registerHooks({
  load(url, context, next) {
    const result = next(url, context);
    if (!url.includes("/.artifacts/build/server/chunks/") || !result.source)
      return result;
    const source =
      typeof result.source === "string"
        ? result.source
        : Buffer.from(result.source).toString("utf8");
    if (!source.includes("async function secureJson(")) return result;
    return {
      ...result,
      source:
        source.replace(
          "async function secureJson(",
          "async function unusedFixtureTransport(",
        ) +
        "\nasync function secureJson(endpoint,path,token) { allowedTarget(endpoint); const result = await (await import(" +
        fixture +
        ")).fixtureRead(endpoint,path,token); if (result.error) throw new SecurityError(result.error,502); return result.body; }\n",
    };
  },
});
