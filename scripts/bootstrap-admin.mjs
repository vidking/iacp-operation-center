// TTY interactiva dentro de Docker. No hay usuario ni contraseña predeterminados.
import { createInterface, emitKeypressEvents } from "node:readline";
import { createInterface as promisesInterface } from "node:readline/promises";
import { createUser } from "../src/lib/server/security/auth.ts";
import { db } from "../src/lib/server/security/database.ts";
if (!process.stdin.isTTY)
  throw new Error("An interactive container TTY is required");
if (db().prepare("SELECT count(*) AS total FROM users").get().total)
  throw new Error("Bootstrap is only available for an empty user store");
const prompts = promisesInterface({
  input: process.stdin,
  output: process.stdout,
});
const username = await prompts.question("Administrator username: ");
const tenant = await prompts.question("IACP tenant identifier: ");
prompts.close();
async function password() {
  process.stdout.write("Password (minimum 14 characters, hidden): ");
  emitKeypressEvents(process.stdin);
  process.stdin.setRawMode(true);
  process.stdin.resume();
  return new Promise((resolve, reject) => {
    let value = "";
    const finish = (error) => {
      process.stdin.removeListener("keypress", listener);
      process.stdin.setRawMode(false);
      process.stdin.pause();
      process.stdout.write("\n");
      error ? reject(error) : resolve(value);
    };
    const listener = (text, key) => {
      if (key?.ctrl && key.name === "c") return finish(new Error("Cancelled"));
      if (key?.name === "return") return finish();
      if (key?.name === "backspace") {
        value = value.slice(0, -1);
        return;
      }
      if (!key?.ctrl && !key?.meta && text && !/[\x00-\x1f\x7f]/.test(text))
        value += text;
    };
    process.stdin.on("keypress", listener);
  });
}
try {
  const secret = await password();
  const id = await createUser(
    username,
    secret,
    "Administrator",
    tenant,
    "bootstrap-cli",
  );
  console.log("Administrator created: " + id);
} catch {
  console.error("Bootstrap failed. No sensitive details logged.");
  process.exitCode = 1;
}
