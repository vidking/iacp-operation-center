import { z } from 'zod';

const targetSchema = z.object({
  origin: z.string().url(),
  addresses: z.array(z.string().min(1)).min(1),
});

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  HOST: z.string().default('127.0.0.1'),
  PORT: z.coerce.number().int().positive().default(4100),
  PUBLIC_ORIGIN: z.string().url().default('http://localhost:5174'),
  IACOC_V2_DB_PATH: z.string().default('/var/lib/iacoc-v2/iacoc.sqlite'),
  IACOC_KEYRING_FILE: z.string().default('/run/iacoc-secrets/keyring.json'),
  IACP_ALLOWED_TARGETS: z.string().default('[]'),
  IACP_TIMEOUT_MS: z.coerce.number().int().positive().max(60000).default(10000),
  IACP_MAX_RESPONSE_BYTES: z.coerce
    .number()
    .int()
    .positive()
    .max(10 * 1024 * 1024)
    .default(1024 * 1024),
});

export type ServerConfig = {
  nodeEnv: 'development' | 'test' | 'production';
  host: string;
  port: number;
  publicOrigin: string;
  dbPath: string;
  keyringFile: string;
  allowedTargets: z.infer<typeof targetSchema>[];
  timeoutMs: number;
  maxResponseBytes: number;
};

export function readServerConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  const parsed = envSchema.parse(env);
  const allowedTargets = z.array(targetSchema).parse(JSON.parse(parsed.IACP_ALLOWED_TARGETS));
  return {
    nodeEnv: parsed.NODE_ENV,
    host: parsed.HOST,
    port: parsed.PORT,
    publicOrigin: parsed.PUBLIC_ORIGIN,
    dbPath: parsed.IACOC_V2_DB_PATH,
    keyringFile: parsed.IACOC_KEYRING_FILE,
    allowedTargets,
    timeoutMs: parsed.IACP_TIMEOUT_MS,
    maxResponseBytes: parsed.IACP_MAX_RESPONSE_BYTES,
  };
}
