import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { readKeyring, SecurityError } from "./config.ts";
export function encryptSecret(secret: string, context: string) {
  const ring = readKeyring();
  const iv = randomBytes(12),
    cipher = createCipheriv(
      "aes-256-gcm",
      Buffer.from(ring.keys[ring.active], "base64"),
      iv,
    );
  cipher.setAAD(Buffer.from(context));
  const data = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
  return JSON.stringify({
    v: 1,
    keyId: ring.active,
    iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
    data: data.toString("base64"),
  });
}
export function decryptSecret(encoded: string, context: string) {
  try {
    const ring = readKeyring(),
      value = JSON.parse(encoded);
    if (value.v !== 1 || !ring.keys[value.keyId]) throw new Error();
    const cipher = createDecipheriv(
      "aes-256-gcm",
      Buffer.from(ring.keys[value.keyId], "base64"),
      Buffer.from(value.iv, "base64"),
    );
    cipher.setAAD(Buffer.from(context));
    cipher.setAuthTag(Buffer.from(value.tag, "base64"));
    return Buffer.concat([
      cipher.update(Buffer.from(value.data, "base64")),
      cipher.final(),
    ]).toString("utf8");
  } catch {
    throw new SecurityError("CREDENTIAL_UNAVAILABLE", 503);
  }
}
