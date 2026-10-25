// Solo Docker/operador autorizado. Credenciales por stdin, nunca argumentos o logs.
import { randomBytes, randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync, renameSync, existsSync } from "node:fs";
import { dirname } from "node:path";
import { config, readKeyring } from "../src/lib/server/security/config.ts";
import { createUser, changeUser } from "../src/lib/server/security/auth.ts";
import { db, audit, transaction } from "../src/lib/server/security/database.ts";
import {
  encryptSecret,
  decryptSecret,
} from "../src/lib/server/security/crypto.ts";
async function input() {
  let value = "";
  for await (const chunk of process.stdin) {
    value += chunk;
    if (value.length > 8192) throw new Error("Input too large");
  }
  return JSON.parse(value);
}
async function main() {
  process.umask(0o077);
  const command = process.argv[2];
  if (command === "init-key") {
    const path = config().keyFile,
      id = "key-" + randomUUID();
    mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
    writeFileSync(
      path,
      JSON.stringify({
        active: id,
        keys: { [id]: randomBytes(32).toString("base64") },
      }),
      { flag: "wx", mode: 0o600 },
    );
    console.log("Keyring created. No key material printed.");
    return;
  }
  if (command === "user-add") {
    const value = await input();
    const id = await createUser(
      value.username,
      value.password,
      value.role,
      value.tenantId,
    );
    console.log("User created: " + id);
    return;
  }
  if (command === "user-change") {
    const value = await input();
    await changeUser(value.username, {
      password: value.password,
      role: value.role,
      disabled: value.disabled,
    });
    console.log("User updated; previous sessions revoked.");
    return;
  }
  if (command === "rotate-key") {
    const old = readKeyring(),
      rows = db()
        .prepare("SELECT id,tenant_id,endpoint,secret FROM connections")
        .all();
    const plaintext = rows.map((row) => ({
      row,
      value: decryptSecret(
        row.secret,
        `${row.id}:${row.tenant_id}:${row.endpoint}`,
      ),
    }));
    const id = "key-" + randomUUID(),
      ring = {
        active: id,
        keys: { ...old.keys, [id]: randomBytes(32).toString("base64") },
      };
    const path = config().keyFile,
      tmp = path + "." + randomUUID();
    writeFileSync(tmp, JSON.stringify(ring), { flag: "wx", mode: 0o600 });
    renameSync(tmp, path);
    transaction(() => {
      for (const { row, value } of plaintext)
        db()
          .prepare("UPDATE connections SET secret=? WHERE id=?")
          .run(
            encryptSecret(value, `${row.id}:${row.tenant_id}:${row.endpoint}`),
            row.id,
          );
      audit("local-cli", "keyring.rotated", id, "platform", {
        connections: rows.length,
      });
    });
    console.log("Key rotation completed. Previous keys retained for backups.");
    return;
  }
  throw new Error("Use init-key, user-add, user-change or rotate-key");
}
main().catch(() => {
  console.error(
    "Administration command failed. Check input, permissions and configuration; no sensitive details logged.",
  );
  process.exitCode = 1;
});
