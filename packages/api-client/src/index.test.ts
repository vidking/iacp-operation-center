import { describe, expect, it, vi } from 'vitest';
import { IacocApiClient } from './index';

describe('cliente BFF', () => {
  it('usa rutas internas y credenciales de sesión sin exponer secretos', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          authenticated: false,
          user: null,
          csrfToken: null,
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );
    await new IacocApiClient().session();
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/v2/session',
      expect.objectContaining({ credentials: 'include' }),
    );
    fetchMock.mockRestore();
  });

  it('envía exactamente la activación single-tenant confirmada', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ active: true, scopeConfirmed: true, mode: 'LIVE' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    await new IacocApiClient().activateConnection('connection-1', 'csrf-token', {
      action: 'activate',
      confirmSingleTenant: true,
    });
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/v2/connections/connection-1/activate',
      expect.objectContaining({
        body: '{"action":"activate","confirmSingleTenant":true}',
      }),
    );
    fetchMock.mockRestore();
  });
});
