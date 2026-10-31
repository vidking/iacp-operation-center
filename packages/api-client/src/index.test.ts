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
});
