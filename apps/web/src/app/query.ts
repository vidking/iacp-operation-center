import { useQueries, useQuery } from '@tanstack/react-query';
import { apiClient, type ResourceQuery } from '@iacoc/api-client';
import type { Connection } from '@iacoc/contracts';

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
  query: ResourceQuery = { limit: 100 },
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
  query: ResourceQuery = { limit: 100 },
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
  query: ResourceQuery = { limit: 100 },
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

export function useOperation(
  connectionId: string | null,
  operationId: string | null,
  enabled: boolean,
) {
  return useQuery({
    queryKey: ['operation', connectionId, operationId],
    queryFn: () => apiClient.operation(connectionId as string, operationId as string),
    enabled: enabled && Boolean(connectionId) && Boolean(operationId),
    staleTime: 10_000,
    retry: false,
  });
}

export function useIncidents(connectionId: string | null, enabled: boolean) {
  return useQuery({
    queryKey: ['incidents', connectionId],
    queryFn: () => apiClient.incidents(connectionId as string, { limit: 100 }),
    enabled: enabled && Boolean(connectionId),
    staleTime: 5_000,
    refetchInterval: enabled && connectionId ? 10_000 : false,
    retry: false,
  });
}

type SnapshotQuery = {
  data?: unknown;
  isPending: boolean;
  isFetching: boolean;
  isError: boolean;
  dataUpdatedAt: number;
};

export type OverviewSourceSnapshot = {
  connection: Connection;
  instances: SnapshotQuery;
  operations: SnapshotQuery;
  events: SnapshotQuery;
  workers: SnapshotQuery;
  incidents: SnapshotQuery;
};

export function useOverviewSourceSnapshots(
  connections: Connection[],
  enabled: boolean,
): OverviewSourceSnapshot[] {
  const activeConnections = connections.filter((connection) => connection.active);
  const results = useQueries({
    queries: activeConnections.flatMap((connection) => {
      const id = connection.id;
      const options = {
        enabled: enabled && connection.active,
        staleTime: 5_000,
        refetchInterval: enabled && connection.active ? 10_000 : false,
        refetchIntervalInBackground: false,
        retry: false,
      } as const;
      return [
        {
          ...options,
          queryKey: ['overview-snapshot', 'instances', id],
          queryFn: () => apiClient.instances(id, { limit: 50 }),
        },
        {
          ...options,
          queryKey: ['overview-snapshot', 'operations', id],
          queryFn: () => apiClient.operations(id, { limit: 50 }),
        },
        {
          ...options,
          queryKey: ['overview-snapshot', 'events', id],
          queryFn: () => apiClient.events(id, { limit: 50 }),
        },
        {
          ...options,
          queryKey: ['overview-snapshot', 'workers', id],
          queryFn: () => apiClient.workers(id),
        },
        {
          ...options,
          queryKey: ['overview-snapshot', 'incidents', id],
          queryFn: () => apiClient.incidents(id, { limit: 50 }),
        },
      ];
    }),
  });
  return activeConnections.map((connection, index) => {
    const start = index * 5;
    return {
      connection,
      instances: results[start] as SnapshotQuery,
      operations: results[start + 1] as SnapshotQuery,
      events: results[start + 2] as SnapshotQuery,
      workers: results[start + 3] as SnapshotQuery,
      incidents: results[start + 4] as SnapshotQuery,
    };
  });
}
