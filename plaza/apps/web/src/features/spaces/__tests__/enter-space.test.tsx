import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { isApiError } from '@/shared/api';
import { spaceFixture } from '@/test/fixtures';
import { apiError, mockApi } from '@/test/mock-api';

import { useEnterSpace } from '..';

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe('useEnterSpace (E2-S4, for /s/:slug)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('enters by slug, joining through the allowed domain', async () => {
    const api = mockApi({
      'POST /api/spaces/by-slug/oficina-acme/enter': {
        body: { space: spaceFixture({ role: 'MEMBER', inviteUrl: null }), joined: true },
      },
    });

    const { result } = renderHook(() => useEnterSpace('oficina-acme'), { wrapper });

    await waitFor(() => {
      expect(result.current.data?.joined).toBe(true);
    });
    expect(result.current.data?.space.role).toBe('MEMBER');
    expect(api.callsTo('POST /api/spaces/by-slug/oficina-acme/enter')).toHaveLength(1);
  });

  it('reports NOT_A_MEMBER for everyone else', async () => {
    mockApi({ 'POST /api/spaces/by-slug/oficina-acme/enter': apiError(404, 'NOT_A_MEMBER') });

    const { result } = renderHook(() => useEnterSpace('oficina-acme'), { wrapper });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });
    expect(isApiError(result.current.error) && result.current.error.code).toBe('NOT_A_MEMBER');
  });
});
