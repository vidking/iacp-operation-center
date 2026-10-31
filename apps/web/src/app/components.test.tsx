import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { UnavailableState } from './components';

describe('componentes del shell', () => {
  it('explica la ausencia de capacidad sin simular datos', () => {
    render(<UnavailableState reason="No se publicó la capacidad." />);
    expect(screen.getByText('Capacidad no disponible')).toBeInTheDocument();
    expect(
      screen.getByText('No mostramos datos sintéticos ni inferimos salud remota.'),
    ).toBeInTheDocument();
  });
});
