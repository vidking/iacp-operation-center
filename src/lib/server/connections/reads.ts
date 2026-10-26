import { createHash } from "node:crypto";
import { singleFlight } from "../../refresh.ts";
import { secureJson } from "./transport.ts";
// Coalesce concurrent GETs only. No retained cache; revocation always rechecked.
export function sharedRead(endpoint: string, path: string, token: string) {
  const key = createHash("sha256")
    .update(endpoint)
    .update("\0")
    .update(token)
    .update("\0")
    .update(path)
    .digest("hex");
  return singleFlight("upstream-get:" + key, () =>
    secureJson(endpoint, path, token),
  );
}
