<script lang="ts">
  import { ChevronDown, ArrowUpRight, Server } from "@lucide/svelte";
  import { formatTime, utcTime } from "#lib/time.ts";
  import type { Operation } from "#lib/types/observation.ts";
  import { selectedOperation } from "#lib/stores/portal.ts";
  import Badge from "./ui/Badge.svelte";
  import EmptyState from "./ui/EmptyState.svelte";

  type InstanceReference = {
    instance_id: string;
    name: string;
    vmid: number | null;
    node: string | null;
  };
  type OperationGroup = {
    instance_id: string;
    instance: InstanceReference | null;
    operations: Operation[];
    latestUpdatedAt: string;
    counts: Record<string, number>;
  };
  let { groups = [] }: { groups?: OperationGroup[] } = $props();
</script>

{#if groups.length}
  <div class="instance-groups" aria-label="Operaciones agrupadas por instancia">
    {#each groups as group}
      <details class="instance-group">
        <summary>
          <span class="instance-group-title">
            <Server size={16} />
            <strong>{group.instance?.name ?? group.instance_id}</strong>
            <small class="mono">{group.instance_id}</small>
          </span>
          <span class="instance-group-meta">
            {#if group.instance?.vmid !== null && group.instance?.vmid !== undefined}
              VMID {group.instance.vmid} ·
            {/if}
            {group.instance?.node ?? "Nodo no publicado"} · {group.operations
              .length}
            operaciones
            <ChevronDown size={15} />
          </span>
        </summary>
        <div class="instance-group-body">
          <div class="instance-group-facts">
            <span>Última evidencia: {formatTime(group.latestUpdatedAt)}</span>
            <span
              >Completadas {group.counts.completed ?? 0} · Fallidas {group
                .counts.failed ?? 0} · Inciertas {group.counts.uncertain ??
                0}</span
            >
          </div>
          <ol class="instance-operation-history">
            {#each group.operations as operation}
              <li>
                <time title={utcTime(operation.updated_at)}
                  >{formatTime(operation.updated_at)}</time
                >
                <button
                  class="operation-link mono"
                  onclick={() => selectedOperation.set(operation.operation_id)}
                  >{operation.operation_id}<ArrowUpRight size={12} /></button
                >
                <span>{operation.kind}</span>
                <Badge value={operation.normalized_status} />
              </li>
            {/each}
          </ol>
          <a class="text-link" href={`/crm?instance=${group.instance_id}`}
            >Abrir instancia en CRM</a
          >
        </div>
      </details>
    {/each}
  </div>
{:else}
  <EmptyState />
{/if}
