<script lang="ts">
  import { ArrowUpRight, ChevronDown } from "@lucide/svelte";
  import { formatTime, utcTime } from "#lib/time.ts";
  import type { AuditEvent } from "#lib/types/observation.ts";
  import { selectedOperation } from "#lib/stores/portal.ts";
  import Badge from "./ui/Badge.svelte";
  import EmptyState from "./ui/EmptyState.svelte";

  type InstanceReference = {
    instance_id: string;
    name: string;
    vmid: number | null;
    node: string | null;
  };
  type EventGroup = {
    instance_id: string;
    instance: InstanceReference | null;
    events: AuditEvent[];
  };
  let { groups = [] }: { groups?: EventGroup[] } = $props();
</script>

{#if groups.length}
  <div class="instance-groups" aria-label="Eventos agrupados por instancia">
    {#each groups as group}
      <details class="instance-group">
        <summary>
          <span class="instance-group-title">
            <strong>{group.instance?.name ?? group.instance_id}</strong>
            <small class="mono">{group.instance_id}</small>
          </span>
          <span class="instance-group-meta">
            {#if group.instance?.vmid !== null && group.instance?.vmid !== undefined}
              VMID {group.instance.vmid} ·
            {/if}
            {group.instance?.node ?? "Nodo no publicado"} · {group.events
              .length}
            eventos <ChevronDown size={15} />
          </span>
        </summary>
        <div class="instance-group-body">
          <ol class="instance-operation-history">
            {#each group.events as event}
              <li>
                <time title={utcTime(event.occurred_at)}
                  >{formatTime(event.occurred_at)}</time
                >
                <strong>{event.kind}</strong>
                <span>{event.code}</span>
                <Badge value={event.status} />
                <button
                  class="operation-link mono"
                  onclick={() => selectedOperation.set(event.operation_id)}
                  >{event.operation_id}<ArrowUpRight size={12} /></button
                >
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
