import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { EvidenceState, UnavailableState } from './components';

describe('componentes del shell', () => {
  it('explica la ausencia de capacidad sin simular datos', () => {
    render(<UnavailableState reason="No se publicó la capacidad." />);
    expect(screen.getByText('Capacidad no disponible')).toBeInTheDocument();
    expect(
      screen.getByText('No mostramos datos sintéticos ni inferimos salud remota.'),
    ).toBeInTheDocument();
  });

  it('muestra la ausencia operativa como estado compacto', () => {
    render(
      <EvidenceState
        title="Workers no publicados"
        reason="La fuente no publica workers individuales."
      />,
    );
    expect(screen.getByRole('status')).toHaveTextContent('Workers no publicados');
    expect(screen.getByRole('status')).toHaveTextContent(
      'La fuente no publica workers individuales.',
    );
  });
});
