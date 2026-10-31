import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { randomBytes, randomUUID } from 'node:crypto';
import { dirname } from 'node:path';
import { readServerConfig } from '@iacoc/config';

const config = readServerConfig();
if (existsSync(config.keyringFile)) throw new Error('El keyring ya existe; no se sobrescribe.');
mkdirSync(dirname(config.keyringFile), { recursive: true, mode: 0o700 });
const keyId = randomUUID();
writeFileSync(
  config.keyringFile,
  JSON.stringify(
    {
      version: 1,
      activeKeyId: keyId,
      keys: { [keyId]: randomBytes(32).toString('base64') },
    },
    null,
    2,
  ) + '\n',
  { mode: 0o600, flag: 'wx' },
);
process.stdout.write('Keyring V2 creado fuera de SQLite.\n');
