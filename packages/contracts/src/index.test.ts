import { describe, expect, it } from 'vitest';
import { connectionSchema, displayDependencyState, displayPublishedValue } from './index';

describe('contratos de datos publicados', () => {
  it('mantiene valores no publicados como estado informativo', () => {
    expect(displayPublishedValue(undefined)).toBe('No publicado');
    expect(displayDependencyState('not-published')).toBe('No publicado');
    expect(displayDependencyState('unknown')).toBe('Desconocido');
  });

  it('rechaza conexiones sin campos de alcance explícitos', () => {
    expect(() => connectionSchema.parse({ id: 'x' })).toThrow();
  });
});
