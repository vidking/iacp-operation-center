<script lang="ts">
  import { ChevronDown } from "@lucide/svelte";
  import { formatTime } from "#lib/time.ts";
  import { incidentLabels } from "#lib/types/incidents.ts";
  import type { IncidentPage } from "#lib/server/incidents/service.ts";
  import { selectedOperation } from "#lib/stores/portal.ts";
  import Badge from "./ui/Badge.svelte";
  import EmptyState from "./ui/EmptyState.svelte";

  type Group = IncidentPage["grouped"][number];
  let { groups = [] }: { groups?: Group[] } = $props();
</script>

{#if groups.length}
  <div class="instance-groups" aria-label="Incidentes agrupados por instancia">
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
            {group.instance?.node ?? "Nodo no publicado"} · {group.incidents
              .length}
            señales <ChevronDown size={15} />
          </span>
        </summary>
        <div class="instance-group-body">
          <ol class="instance-operation-history">
            {#each group.incidents as incident}
              <li>
                <time>{formatTime(incident.operation.updated_at)}</time>
                <button
                  class="operation-link mono"
                  onclick={() =>
                    selectedOperation.set(incident.operation.operation_id)}
                  >{incident.operation.operation_id}</button
                >
                <span>{incident.diagnosis.category}</span>
                <Badge value={incident.operation.normalized_status} />
                <span
                  >{incident.state
                    ? incidentLabels[incident.state]
                    : "Histórico"}</span
                >
              </li>
            {/each}
          </ol>
        </div>
      </details>
    {/each}
  </div>
{:else}
  <EmptyState />
{/if}
