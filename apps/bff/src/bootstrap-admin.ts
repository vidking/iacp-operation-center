import { readFile } from 'node:fs/promises';
import { createUser } from './auth';
import { openDatabase } from './db';
import { readServerConfig } from '@iacoc/config';

type BootstrapInput = {
  username: string;
  password: string;
  tenant: string;
};

const raw = await readFile('/dev/stdin', 'utf8');
const input = JSON.parse(raw) as Partial<BootstrapInput>;
if (!input.username || !input.password || !input.tenant) {
  throw new Error('stdin debe contener username, password y tenant.');
}

const config = readServerConfig();
const database = openDatabase(config.dbPath);
try {
  const existing = database.prepare('SELECT COUNT(*) AS count FROM users').get() as {
    count: number;
  };
  if (existing.count > 0)
    throw new Error('El bootstrap inicial solo puede ejecutarse sin usuarios.');
  await createUser(database, input.username, input.password, 'Administrador', input.tenant);
  process.stdout.write('Administrador inicial creado.\n');
} finally {
  database.close();
}
