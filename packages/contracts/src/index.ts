import { z } from 'zod';

export const roleSchema = z.enum(['Lector', 'Operador', 'Administrador']);
export type Role = z.infer<typeof roleSchema>;

export const themeSchema = z.enum(['graphite', 'light']);
export type Theme = z.infer<typeof themeSchema>;

export const fontScaleSchema = z.enum(['compact', 'normal', 'large']);
export type FontScale = z.infer<typeof fontScaleSchema>;

export const densitySchema = z.enum(['compact', 'comfortable']);
export type Density = z.infer<typeof densitySchema>;

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

export const connectionGrantSchema = z.object({
  connectionId: z.string().uuid(),
  canRead: z.boolean(),
  canOperate: z.boolean(),
});
export type ConnectionGrant = z.infer<typeof connectionGrantSchema>;

export const userSchema = z.object({
  id: z.string().uuid(),
  username: z.string(),
  role: roleSchema,
  tenant: z.string(),
  createdAt: z.string(),
  grants: z.array(connectionGrantSchema),
});
export type User = z.infer<typeof userSchema>;

export const userCreateRequestSchema = z.object({
  username: z.string().trim().min(1).max(120),
  password: z.string().min(12).max(4096),
  role: roleSchema,
  tenant: z.string().trim().min(1).max(120),
  grants: z.array(connectionGrantSchema).default([]),
});
export type UserCreateRequest = z.infer<typeof userCreateRequestSchema>;

export const userUpdateRequestSchema = z
  .object({
    password: z.string().min(12).max(4096).optional(),
    role: roleSchema.optional(),
    tenant: z.string().trim().min(1).max(120).optional(),
    grants: z.array(connectionGrantSchema).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, 'Debe existir un cambio.');
export type UserUpdateRequest = z.infer<typeof userUpdateRequestSchema>;

export const settingsSchema = z.object({
  theme: themeSchema,
  fontScale: fontScaleSchema,
  density: densitySchema,
  reducedMotion: z.boolean(),
});
export type Settings = z.infer<typeof settingsSchema>;

export const settingsUpdateRequestSchema = settingsSchema
  .partial()
  .refine((value) => Object.keys(value).length > 0, 'Debe existir un cambio.');
export type SettingsUpdateRequest = z.infer<typeof settingsUpdateRequestSchema>;

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

export const connectionCreateRequestSchema = z.object({
  name: z.string().trim().min(1).max(120),
  endpoint: z.string().url(),
  bearer: z.string().min(1).max(4096),
});
export type ConnectionCreateRequest = z.infer<typeof connectionCreateRequestSchema>;

export const connectionUpdateRequestSchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    endpoint: z.string().url().optional(),
    bearer: z.string().min(1).max(4096).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, 'Debe existir un cambio.');
export type ConnectionUpdateRequest = z.infer<typeof connectionUpdateRequestSchema>;

export const overviewSchema = z.object({
  connectionState: connectionStatusSchema,
  sources: z.array(connectionSchema),
  source: connectionSchema.nullable(),
  evidence: z.enum(['published', 'partial', 'not-published', 'unknown']),
  activeOperations: z.number().int().nonnegative().nullable(),
  incidents: z.number().int().nonnegative().nullable(),
  lastEvidenceAt: z.string().nullable(),
  message: z.string(),
});
export type Overview = z.infer<typeof overviewSchema>;

export const instanceProvisionRequestSchema = z.object({
  connectionId: z.string().uuid(),
  name: z
    .string()
    .trim()
    .min(1)
    .max(63)
    .regex(/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/),
  planId: z.enum(['kvm-1', 'kvm-2', 'kvm-3', 'kvm-4']),
  imageId: z
    .string()
    .trim()
    .min(1)
    .max(63)
    .regex(/^[a-z0-9][a-z0-9._-]*$/),
  networkProfile: z.enum(['lab-dhcp', 'wan-static']).default('lab-dhcp'),
  startOnCreate: z.boolean().default(true),
  accessMode: z.literal('managed-ssh').default('managed-ssh'),
});
export type InstanceProvisionRequest = z.infer<typeof instanceProvisionRequestSchema>;

export const instanceDeleteRequestSchema = z
  .object({
    confirm: z.literal(true),
    operationId: z.string().uuid().optional(),
    planSha256: z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .optional(),
  })
  .superRefine((value, context) => {
    if (Boolean(value.operationId) !== Boolean(value.planSha256)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'operationId y planSha256 deben enviarse juntos.',
        path: ['operationId'],
      });
    }
  });
export type InstanceDeleteRequest = z.infer<typeof instanceDeleteRequestSchema>;

export const connectionResourceQuerySchema = z.object({
  connectionId: z.string().uuid(),
});
export type ConnectionResourceQuery = z.infer<typeof connectionResourceQuerySchema>;

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
