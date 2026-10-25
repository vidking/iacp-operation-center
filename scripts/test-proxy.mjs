// Reverse proxy HTTPS de laboratorio, sin Traefik ni tráfico empresarial.
import { createServer } from "node:https";
import { request } from "node:http";
import { mkdirSync, readFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
const root = resolve(".artifacts/proxy-fixture");
mkdirSync(root, { recursive: true });
const key = root + "/key.pem",
  cert = root + "/cert.pem";
if (!existsSync(cert))
  execFileSync(
    "openssl",
    [
      "req",
      "-x509",
      "-newkey",
      "rsa:2048",
      "-nodes",
      "-keyout",
      key,
      "-out",
      cert,
      "-days",
      "1",
      "-subj",
      "/CN=127.0.0.1",
      "-addext",
      "subjectAltName=IP:127.0.0.1",
    ],
    { stdio: "ignore" },
  );
createServer(
  { key: readFileSync(key), cert: readFileSync(cert) },
  (req, res) => {
    const upstream = request(
      {
        host: "127.0.0.1",
        port: 4175,
        path: req.url,
        method: req.method,
        headers: {
          ...req.headers,
          host: "127.0.0.1:4443",
          "x-forwarded-proto": "https",
          "x-forwarded-host": "127.0.0.1:4443",
          connection: "close",
        },
      },
      (reply) => {
        res.writeHead(reply.statusCode ?? 502, reply.headers);
        reply.pipe(res);
      },
    );
    upstream.on("error", () => {
      res.writeHead(502);
      res.end("Fixture unavailable");
    });
    req.pipe(upstream);
  },
).listen(4443, "127.0.0.1");
