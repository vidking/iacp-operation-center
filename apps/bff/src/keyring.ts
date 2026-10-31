import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';

type KeyringDocument = {
  version: 1;
  activeKeyId: string;
  keys: Record<string, string>;
};

export type EncryptedCredential = {
  ciphertext: string;
  nonce: string;
  tag: string;
  keyId: string;
};

function readKeyring(filename: string): KeyringDocument {
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(filename, 'utf8')) as unknown;
  } catch {
    throw new Error('El keyring externo no está disponible.');
  }
  if (!parsed || typeof parsed !== 'object') throw new Error('El keyring externo no es válido.');
  const document = parsed as Partial<KeyringDocument>;
  const key = document.keys?.[document.activeKeyId ?? ''];
  if (document.version !== 1 || !document.activeKeyId || typeof key !== 'string') {
    throw new Error('El keyring externo no es válido.');
  }
  const material = Buffer.from(key, 'base64');
  if (material.length !== 32) throw new Error('La clave activa del keyring no es válida.');
  return document as KeyringDocument;
}

function associatedData(connectionId: string, credentialVersion: number): Buffer {
  return Buffer.from(`iacoc-v2:connection:${connectionId}:credential:${credentialVersion}`, 'utf8');
}

export function encryptBearer(
  filename: string,
  connectionId: string,
  credentialVersion: number,
  bearer: string,
): EncryptedCredential {
  const keyring = readKeyring(filename);
  const keyMaterial = keyring.keys[keyring.activeKeyId];
  if (!keyMaterial) throw new Error('La clave activa del keyring no está disponible.');
  const key = Buffer.from(keyMaterial, 'base64');
  const nonce = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, nonce);
  cipher.setAAD(associatedData(connectionId, credentialVersion));
  const ciphertext = Buffer.concat([cipher.update(bearer, 'utf8'), cipher.final()]);
  return {
    ciphertext: ciphertext.toString('base64'),
    nonce: nonce.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'),
    keyId: keyring.activeKeyId,
  };
}

export function decryptBearer(
  filename: string,
  connectionId: string,
  credentialVersion: number,
  encrypted: EncryptedCredential,
): string {
  const keyring = readKeyring(filename);
  const keyMaterial = keyring.keys[encrypted.keyId];
  if (!keyMaterial) throw new Error('La clave de la credencial no está en el keyring.');
  const decipher = createDecipheriv(
    'aes-256-gcm',
    Buffer.from(keyMaterial, 'base64'),
    Buffer.from(encrypted.nonce, 'base64'),
  );
  decipher.setAAD(associatedData(connectionId, credentialVersion));
  decipher.setAuthTag(Buffer.from(encrypted.tag, 'base64'));
  return Buffer.concat([
    decipher.update(Buffer.from(encrypted.ciphertext, 'base64')),
    decipher.final(),
  ]).toString('utf8');
}
