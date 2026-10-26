// Ejecutar con Node únicamente dentro del contenedor, contra el build o la imagen final.
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { resolve, join } from "node:path";
import assert from "node:assert/strict";
const root = resolve(process.argv[2] ?? "build");
assert.ok(existsSync(root), "Production build must exist");
let count = 0;
function inspect(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) inspect(path);
    else if (/\.(js|json|html)$/.test(entry.name)) {
      const content = readFileSync(path, "utf8");
      assert.ok(
        !/fixtureRead|Disposable integration fixture|authorized-profile|mockSource|demo-op-|CUS-DEMO|MOCK WORKSPACE|Sandbox workspace|DATA_MODE|Usar MOCK|ConnectionWizard/.test(
          content,
        ),
        "Synthetic runtime in " + path,
      );
      count++;
    }
  }
}
inspect(root);
assert.ok(count > 10);
console.log(
  "PRODUCTION_ARTIFACT_PASS: " +
    count +
    " compiled files; no synthetic source, mode selector or wizard",
);
