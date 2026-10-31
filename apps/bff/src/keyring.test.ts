import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { randomBytes, randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { decryptBearer, encryptBearer } from './keyring';

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe('keyring AES-GCM', () => {
  it('cifra y recupera una credencial usando AAD por conexión y versión', () => {
    const directory = mkdtempSync(join(tmpdir(), 'iacoc-keyring-'));
    temporaryDirectories.push(directory);
    const keyId = randomUUID();
    writeFileSync(
      join(directory, 'keyring.json'),
      JSON.stringify({
        version: 1,
        activeKeyId: keyId,
        keys: { [keyId]: randomBytes(32).toString('base64') },
      }),
    );
    const encrypted = encryptBearer(
      join(directory, 'keyring.json'),
      'connection-1',
      1,
      'fixture-token',
    );
    expect(encrypted.ciphertext).not.toContain('fixture-token');
    expect(decryptBearer(join(directory, 'keyring.json'), 'connection-1', 1, encrypted)).toBe(
      'fixture-token',
    );
    expect(() =>
      decryptBearer(join(directory, 'keyring.json'), 'connection-1', 2, encrypted),
    ).toThrow();
  });
});
