// Adaptador Node con esquema canónico de runtime y frontera explícita del proxy.
import { createServer } from "node:http";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { config } from "../src/lib/server/security/config.ts";
const settings = config();
const trustedProtocolHeader = "x-iacoc-internal-scheme";
// Nunca confiar en esta cabecera enviada por un cliente: se sobrescribe siempre.
process.env.PROTOCOL_HEADER = trustedProtocolHeader;
delete process.env.HOST_HEADER;
delete process.env.PORT_HEADER;
delete process.env.ADDRESS_HEADER;
const { handler } = await import(
  pathToFileURL(resolve(process.argv[2] ?? "build", "handler.js")).href
);
const server = createServer(
  {
    maxHeaderSize: 16384,
    requestTimeout: 15000,
    headersTimeout: 10000,
    keepAliveTimeout: 5000,
  },
  (request, response) => {
    const technical = request.url?.split("?")[0] === "/health";
    if (
      settings.https &&
      !technical &&
      (process.env.TRUST_PROXY !== "true" ||
        request.headers["x-forwarded-proto"] !== "https")
    ) {
      response.writeHead(403, {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
      });
      response.end('{"error":"TRUSTED_HTTPS_PROXY_REQUIRED"}');
      return;
    }
    request.headers[trustedProtocolHeader] = new URL(
      settings.origin,
    ).protocol.slice(0, -1);
    handler(request, response);
  },
);
server.maxConnections = 256;
server.maxRequestsPerSocket = 100;
server.listen(
  Number(process.env.PORT ?? 3000),
  process.env.HOST ?? "0.0.0.0",
  () => console.log("IaCoC HTTP listener ready; authentication required."),
);
for (const signal of ["SIGTERM", "SIGINT"])
  process.once(signal, () => {
    server.close(() => process.exit(0));
    setTimeout(() => {
      server.closeAllConnections();
      process.exit(0);
    }, 10000).unref();
  });
