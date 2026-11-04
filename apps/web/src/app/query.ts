import { useQueries, useQuery } from '@tanstack/react-query';
import { ApiError, apiClient, type ResourceQuery } from '@iacoc/api-client';
import type { Connection } from '@iacoc/contracts';

function configuredRefreshInterval(defaultSeconds: number): number | false {
  if (typeof window === 'undefined') return defaultSeconds * 1000;
  const value = window.localStorage.getItem('iacoc-v2-refresh-interval');
  if (value === 'off') return false;
  const seconds = Number(value ?? defaultSeconds);
  return Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : defaultSeconds * 1000;
}

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

export function useNetworkProfiles(connectionId: string | null, enabled: boolean) {
  return useQuery({
    queryKey: ['network-profiles', connectionId],
    queryFn: () => apiClient.networkProfiles(connectionId as string),
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
    refetchInterval: enabled && connectionId ? configuredRefreshInterval(5) : false,
    retry: false,
  });
}

export function useProvisioning(connectionId: string | null, enabled: boolean) {
  return useQuery({
    queryKey: ['provisioning', connectionId],
    queryFn: () => apiClient.provisioning(connectionId as string),
    enabled: enabled && Boolean(connectionId),
    staleTime: 2_000,
    refetchInterval: enabled && connectionId ? configuredRefreshInterval(3) : false,
    retry: false,
  });
}

export function useInstanceDetail(
  connectionId: string | null,
  instanceId: string | null,
  enabled: boolean,
) {
  return useQuery({
    queryKey: ['instance-detail', connectionId, instanceId],
    queryFn: () => apiClient.instance(connectionId as string, instanceId as string),
    enabled: enabled && Boolean(connectionId) && Boolean(instanceId),
    staleTime: 2_000,
    refetchInterval: enabled && connectionId && instanceId ? configuredRefreshInterval(5) : false,
    retry: false,
  });
}

export function useInstancePower(
  connectionId: string | null,
  instanceId: string | null,
  enabled: boolean,
) {
  return useQuery({
    queryKey: ['instance-power', connectionId, instanceId],
    queryFn: () => apiClient.instancePower(connectionId as string, instanceId as string),
    enabled: enabled && Boolean(connectionId) && Boolean(instanceId),
    staleTime: 2_000,
    refetchInterval: enabled && connectionId && instanceId ? configuredRefreshInterval(5) : false,
    retry: false,
  });
}

export function useInstanceNetwork(
  connectionId: string | null,
  instanceId: string | null,
  enabled: boolean,
) {
  return useQuery({
    queryKey: ['instance-network', connectionId, instanceId],
    queryFn: () => apiClient.instanceNetwork(connectionId as string, instanceId as string),
    enabled: enabled && Boolean(connectionId) && Boolean(instanceId),
    staleTime: 5_000,
    refetchInterval: enabled && connectionId && instanceId ? configuredRefreshInterval(10) : false,
    retry: (failureCount, error) =>
      error instanceof ApiError && error.status >= 500 && error.status < 600 && failureCount < 2,
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
    refetchInterval: enabled && connectionId ? configuredRefreshInterval(5) : false,
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
    staleTime: 15_000,
    refetchInterval: false,
    retry: false,
  });
}

export function useWorkers(connectionId: string | null, enabled: boolean) {
  return useQuery({
    queryKey: ['workers', connectionId],
    queryFn: () => apiClient.workers(connectionId as string),
    enabled: enabled && Boolean(connectionId),
    staleTime: 2_000,
    refetchInterval: enabled && connectionId ? configuredRefreshInterval(5) : false,
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

export function useIncidents(
  connectionId: string | null,
  enabled: boolean,
  query: ResourceQuery = { limit: 100 },
) {
  return useQuery({
    queryKey: ['incidents', connectionId, query],
    queryFn: () => apiClient.incidents(connectionId as string, query),
    enabled: enabled && Boolean(connectionId),
    staleTime: 15_000,
    refetchInterval: false,
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
  refreshKey = '',
): OverviewSourceSnapshot[] {
  const activeConnections = connections.filter((connection) => connection.active);
  const results = useQueries({
    queries: activeConnections.flatMap((connection) => {
      const id = connection.id;
      const options = {
        enabled: enabled && connection.active,
        staleTime: 5_000,
        refetchInterval: enabled && connection.active ? configuredRefreshInterval(10) : false,
        refetchIntervalInBackground: false,
        retry: false,
      } as const;
      return [
        {
          ...options,
          queryKey: ['overview-snapshot', 'instances', id, refreshKey],
          queryFn: () => apiClient.instances(id, { limit: 100, include_deleted: false }),
        },
        {
          ...options,
          queryKey: ['overview-snapshot', 'operations', id, refreshKey],
          queryFn: () => apiClient.operations(id, { limit: 50 }),
        },
        {
          ...options,
          queryKey: ['overview-snapshot', 'events', id, refreshKey],
          queryFn: () =>
            apiClient.events(id, { limit: 50, ...(refreshKey ? { refresh: refreshKey } : {}) }),
        },
        {
          ...options,
          queryKey: ['overview-snapshot', 'workers', id, refreshKey],
          queryFn: () => apiClient.workers(id),
        },
        {
          ...options,
          queryKey: ['overview-snapshot', 'incidents', id, refreshKey],
          queryFn: () =>
            apiClient.incidents(id, { limit: 50, ...(refreshKey ? { refresh: refreshKey } : {}) }),
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
