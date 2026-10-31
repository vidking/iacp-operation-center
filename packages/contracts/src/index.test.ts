import { describe, expect, it } from 'vitest';
import {
  connectionKindSchema,
  connectionSchema,
  displayDependencyState,
  displayPublishedValue,
} from './index';

describe('contratos de datos publicados', () => {
  it('mantiene valores no publicados como estado informativo', () => {
    expect(displayPublishedValue(undefined)).toBe('No publicado');
    expect(displayDependencyState('not-published')).toBe('No publicado');
    expect(displayDependencyState('unknown')).toBe('Desconocido');
  });

  it('rechaza conexiones sin campos de alcance explícitos', () => {
    expect(() => connectionSchema.parse({ id: 'x' })).toThrow();
  });

  it('solo acepta conexiones del contrato ControlPlaneV2', () => {
    expect(connectionKindSchema.safeParse('controlplane-v1').success).toBe(false);
    expect(connectionKindSchema.parse('controlplane-v2')).toBe('controlplane-v2');
  });
});
