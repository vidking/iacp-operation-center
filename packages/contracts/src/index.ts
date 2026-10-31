import { z } from 'zod';

export const roleSchema = z.enum(['Lector', 'Operador', 'Administrador']);
export type Role = z.infer<typeof roleSchema>;

export const connectionKindSchema = z.literal('controlplane-v2');
export type ConnectionKind = z.infer<typeof connectionKindSchema>;

export const connectionStatusSchema = z.enum([
  'disconnected',
  'pending-confirmation',
  'validating',
  'active',
  'active-partial',
  'error',
]);
export type ConnectionStatus = z.infer<typeof connectionStatusSchema>;

export const normalizedStatusSchema = z.enum([
  'queued',
  'running',
  'completed',
  'failed',
  'uncertain',
  'unknown',
  'stale',
]);
export type NormalizedStatus = z.infer<typeof normalizedStatusSchema>;

export const sessionSchema = z.object({
  authenticated: z.boolean(),
  user: z
    .object({
      id: z.string(),
      username: z.string(),
      role: roleSchema,
      tenant: z.string(),
    })
    .nullable(),
  csrfToken: z.string().nullable(),
});
export type Session = z.infer<typeof sessionSchema>;

export const connectionSchema = z.object({
  id: z.string(),
  name: z.string(),
  endpoint: z.string(),
  kind: connectionKindSchema,
  status: connectionStatusSchema,
  scopeConfirmed: z.boolean(),
  mode: z.enum(['READ_ONLY', 'LIVE']),
  active: z.boolean(),
  tenantId: z.string().nullable(),
  tenantPublished: z.boolean(),
  dependencies: z.enum(['published', 'not-published', 'unknown']),
  lastValidationAt: z.string().nullable(),
  evidenceAt: z.string().nullable(),
  credentialVersion: z.number().int().nonnegative(),
  contractFingerprint: z.string().nullable(),
});
export type Connection = z.infer<typeof connectionSchema>;

export const overviewSchema = z.object({
  connectionState: connectionStatusSchema,
  source: connectionSchema.nullable(),
  evidence: z.enum(['published', 'partial', 'not-published', 'unknown']),
  activeOperations: z.number().int().nonnegative().nullable(),
  incidents: z.number().int().nonnegative().nullable(),
  lastEvidenceAt: z.string().nullable(),
  message: z.string(),
});
export type Overview = z.infer<typeof overviewSchema>;

export const capabilitySchema = z.object({
  name: z.string(),
  available: z.boolean(),
  source: z.enum(['openapi', 'server', 'not-published', 'unknown']),
  reason: z.string().nullable(),
});
export type Capability = z.infer<typeof capabilitySchema>;

export const activationRequestSchema = z.object({
  action: z.literal('activate'),
  confirmSingleTenant: z.boolean(),
});
export type ActivationRequest = z.infer<typeof activationRequestSchema>;

export const connectionErrorSchema = z.object({
  code: z.string(),
  message: z.string(),
  retryable: z.boolean(),
  correlationId: z.string().nullable(),
});
export type ConnectionError = z.infer<typeof connectionErrorSchema>;

export function displayPublishedValue(value: unknown, fallback = 'No publicado'): string {
  if (value === null || value === undefined || value === '') {
    return fallback;
  }
  return String(value);
}

export function displayDependencyState(
  value: Connection['dependencies'],
): 'Publicado' | 'No publicado' | 'Desconocido' {
  if (value === 'published') return 'Publicado';
  if (value === 'not-published') return 'No publicado';
  return 'Desconocido';
}
