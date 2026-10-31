import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { randomBytes, randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { readServerConfig } from '@iacoc/config';
import { createConnection, updateConnection, validateConnection } from './connections';
import { openDatabase } from './db';

vi.mock('node:dns/promises', () => ({
  lookup: vi.fn(async () => [{ address: '127.0.0.1' }]),
}));

const temporaryDirectories: string[] = [];

function keyringFile(): string {
  const directory = mkdtempSync(join(tmpdir(), 'iacoc-connection-'));
  temporaryDirectories.push(directory);
  const keyId = randomUUID();
  const filename = join(directory, 'keyring.json');
  writeFileSync(
    filename,
    JSON.stringify({
      version: 1,
      activeKeyId: keyId,
      keys: { [keyId]: randomBytes(32).toString('base64') },
    }),
  );
  return filename;
}

afterEach(() => {
  vi.restoreAllMocks();
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe('validación técnica ControlPlaneV2', () => {
  it('valida health real y conserva tenant/dependencies no publicados como no publicados', async () => {
    const database = openDatabase(':memory:');
    const keyring = keyringFile();
    const config = readServerConfig({
      NODE_ENV: 'test',
      IACOC_KEYRING_FILE: keyring,
      IACP_ALLOWED_TARGETS: JSON.stringify([
        { origin: 'https://fixture.invalid', addresses: ['127.0.0.1'] },
      ]),
    });
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const path = new URL(String(input)).pathname;
      const body =
        path === '/health/live'
          ? { status: 'alive' }
          : path === '/health/ready'
            ? { status: 'ready' }
            : { observed_at: '2026-10-31T00:00:00.000Z', worker_liveness: 'unknown' };
      return new Response(JSON.stringify(body), { status: 200 });
    });
    const created = createConnection(database, keyring, {
      name: 'ControlPlaneV2 fixture',
      endpoint: 'https://fixture.invalid',
      bearer: 'fixture-token',
    });
    const result = await validateConnection(database, config, created.id);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error);
    expect(result.connection.status).toBe('pending-confirmation');
    expect(result.connection.scopeConfirmed).toBe(false);
    expect(result.connection.tenantPublished).toBe(false);
    expect(result.connection.tenantId).toBeNull();
    expect(result.connection.dependencies).toBe('not-published');
    expect(result.connection.lastValidationAt).not.toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(3);
    const stored = database
      .prepare('SELECT credential_ciphertext FROM connections WHERE id = ?')
      .get(created.id) as { credential_ciphertext: string };
    expect(stored.credential_ciphertext).not.toContain('fixture-token');
    database.close();
  });

  it('invalida el alcance al cambiar la credencial antes de volver a validar', async () => {
    const database = openDatabase(':memory:');
    const keyring = keyringFile();
    const created = createConnection(database, keyring, {
      name: 'ControlPlaneV2 fixture',
      endpoint: 'https://fixture.invalid',
      bearer: 'fixture-token',
    });
    const updated = updateConnection(database, keyring, created.id, { bearer: 'rotated-token' });
    expect(updated).toMatchObject({
      scopeConfirmed: false,
      active: false,
      mode: 'READ_ONLY',
      lastValidationAt: null,
      status: 'validating',
      credentialVersion: 2,
    });
    database.close();
  });
});
