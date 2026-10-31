import { useQuery } from '@tanstack/react-query';
import { apiClient, type ResourceQuery } from '@iacoc/api-client';

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

export function useUsers(enabled: boolean) {
  return useQuery({
    queryKey: ['users'],
    queryFn: () => apiClient.users(),
    enabled,
    staleTime: 10_000,
    retry: false,
  });
}

export function useSettings(enabled: boolean) {
  return useQuery({
    queryKey: ['settings'],
    queryFn: () => apiClient.settings(),
    enabled,
    staleTime: 60_000,
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

export function useInstances(
  connectionId: string | null,
  enabled: boolean,
  query: ResourceQuery = { limit: 200 },
) {
  return useQuery({
    queryKey: ['instances', connectionId, query],
    queryFn: () => apiClient.instances(connectionId as string, query),
    enabled: enabled && Boolean(connectionId),
    staleTime: 5_000,
    refetchInterval: enabled && connectionId ? 5_000 : false,
    retry: false,
  });
}

export function useOperations(
  connectionId: string | null,
  enabled: boolean,
  query: ResourceQuery = { limit: 200 },
) {
  return useQuery({
    queryKey: ['operations', connectionId, query],
    queryFn: () => apiClient.operations(connectionId as string, query),
    enabled: enabled && Boolean(connectionId),
    staleTime: 5_000,
    refetchInterval: enabled && connectionId ? 5_000 : false,
    retry: false,
  });
}

export function useEvents(
  connectionId: string | null,
  enabled: boolean,
  query: ResourceQuery = { limit: 200 },
) {
  return useQuery({
    queryKey: ['events', connectionId, query],
    queryFn: () => apiClient.events(connectionId as string, query),
    enabled: enabled && Boolean(connectionId),
    staleTime: 5_000,
    refetchInterval: enabled && connectionId ? 5_000 : false,
    retry: false,
  });
}

export function useWorkers(connectionId: string | null, enabled: boolean) {
  return useQuery({
    queryKey: ['workers', connectionId],
    queryFn: () => apiClient.workers(connectionId as string),
    enabled: enabled && Boolean(connectionId),
    staleTime: 2_000,
    refetchInterval: enabled && connectionId ? 5_000 : false,
    retry: false,
  });
}

export function useIncidents(connectionId: string | null, enabled: boolean) {
  return useQuery({
    queryKey: ['incidents', connectionId],
    queryFn: () => apiClient.incidents(connectionId as string, { limit: 200 }),
    enabled: enabled && Boolean(connectionId),
    staleTime: 5_000,
    refetchInterval: enabled && connectionId ? 10_000 : false,
    retry: false,
  });
}
