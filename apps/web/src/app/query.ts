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

export function usePlans(connectionId: string | null, enabled: boolean) {
  return useQuery({
    queryKey: ['plans', connectionId],
    queryFn: () => apiClient.plans(connectionId as string),
    enabled: enabled && Boolean(connectionId),
    staleTime: 30_000,
    retry: false,
  });
}

export function useImages(connectionId: string | null, enabled: boolean) {
  return useQuery({
    queryKey: ['images', connectionId],
    queryFn: () => apiClient.images(connectionId as string),
    enabled: enabled && Boolean(connectionId),
    staleTime: 30_000,
    retry: false,
  });
}

export function useInstances(connectionId: string | null, enabled: boolean) {
  return useQuery({
    queryKey: ['instances', connectionId],
    queryFn: () => apiClient.instances(connectionId as string),
    enabled: enabled && Boolean(connectionId),
    staleTime: 5_000,
    retry: false,
  });
}

export function useOperations(connectionId: string | null, enabled: boolean) {
  return useQuery({
    queryKey: ['operations', connectionId],
    queryFn: () => apiClient.operations(connectionId as string),
    enabled: enabled && Boolean(connectionId),
    staleTime: 5_000,
    retry: false,
  });
}

export function useEvents(connectionId: string | null, enabled: boolean) {
  return useQuery({
    queryKey: ['events', connectionId],
    queryFn: () => apiClient.events(connectionId as string),
    enabled: enabled && Boolean(connectionId),
    staleTime: 5_000,
    retry: false,
  });
}
