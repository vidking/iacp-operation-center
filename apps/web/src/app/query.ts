import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@iacoc/api-client';

export function useSession() {
  return useQuery({
    queryKey: ['session'],
    queryFn: () => apiClient.session(),
    staleTime: 30_000,
    retry: false,
  });
}

export function useOverview(enabled: boolean) {
  return useQuery({
    queryKey: ['overview'],
    queryFn: () => apiClient.overview(),
    enabled,
    staleTime: 10_000,
    retry: false,
  });
}

export function useConnections(enabled: boolean) {
  return useQuery({
    queryKey: ['connections'],
    queryFn: () => apiClient.connections(),
    enabled,
    staleTime: 15_000,
    retry: false,
  });
}
