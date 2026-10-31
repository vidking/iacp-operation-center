import { describe, expect, it } from 'vitest';
import { activationDecision, fingerprintEndpoint, scopeNeedsReconfirmation } from './scope';

describe('alcance single-tenant', () => {
  const base = {
    kind: 'controlplane-v2' as const,
    scopeConfirmed: false,
    endpointFingerprint: fingerprintEndpoint('https://iacp-fixture.invalid'),
    credentialVersion: 1,
    contractFingerprint: 'contract-v1',
  };

  it('requiere confirmación antes de activar', () => {
    const result = activationDecision(base, { action: 'activate', confirmSingleTenant: false });
    expect(result).toMatchObject({ ok: false, code: 'SINGLE_TENANT_CONFIRMATION_REQUIRED' });
  });

  it('permite repetir activación sin volver a pedir confirmación', () => {
    const result = activationDecision(
      { ...base, scopeConfirmed: true },
      { action: 'activate', confirmSingleTenant: true },
    );
    expect(result).toEqual({ ok: true, idempotent: true });
  });

  it('invalida el alcance cuando cambia endpoint, credencial o contrato', () => {
    expect(
      scopeNeedsReconfirmation(base, {
        endpointFingerprint: fingerprintEndpoint('https://other.invalid'),
        credentialVersion: 1,
        contractFingerprint: 'contract-v1',
      }),
    ).toBe(true);
  });
});
