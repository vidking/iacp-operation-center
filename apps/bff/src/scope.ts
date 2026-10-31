import { createHash } from 'node:crypto';
import type { ActivationRequest } from '@iacoc/contracts';

export type ScopeRecord = {
  kind: 'controlplane-v2';
  scopeConfirmed: boolean;
  endpointFingerprint: string;
  credentialVersion: number;
  contractFingerprint: string | null;
};

export function fingerprintEndpoint(endpoint: string): string {
  return createHash('sha256').update(endpoint.trim().replace(/\/$/, '')).digest('hex');
}

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => [key, canonical(item)]),
  );
}

export function fingerprintContract(value: unknown): string {
  return createHash('sha256')
    .update(JSON.stringify(canonical(value)))
    .digest('hex');
}

export function activationDecision(
  connection: ScopeRecord,
  request: ActivationRequest,
): { ok: true; idempotent: boolean } | { ok: false; code: string; message: string } {
  if (!connection.scopeConfirmed && !request.confirmSingleTenant) {
    return {
      ok: false,
      code: 'SINGLE_TENANT_CONFIRMATION_REQUIRED',
      message:
        'Un Administrador debe confirmar que este endpoint representa un único alcance remoto autorizado.',
    };
  }
  return { ok: true, idempotent: connection.scopeConfirmed };
}

export function scopeNeedsReconfirmation(
  before: ScopeRecord,
  after: Pick<ScopeRecord, 'endpointFingerprint' | 'credentialVersion' | 'contractFingerprint'>,
): boolean {
  return (
    before.endpointFingerprint !== after.endpointFingerprint ||
    before.credentialVersion !== after.credentialVersion ||
    before.contractFingerprint !== after.contractFingerprint
  );
}
