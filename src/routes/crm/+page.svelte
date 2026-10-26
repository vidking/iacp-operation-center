<script lang="ts">
  import { scheduleReads } from "#lib/refresh.ts";
  import { onMount } from "svelte";
  import { page } from "$app/state";
  import { freshness } from "#lib/types/observation.ts";
  import { formatTime, utcTime } from "#lib/time.ts";
  import {
    activePolicy,
    type Profile,
    type Instance,
    type Policy,
    type Plan,
    type GoldenImage,
  } from "#lib/types/crm.ts";
  import { selectedOperation } from "#lib/stores/portal.ts";
  import CommercialCatalog from "#lib/components/sections/CommercialCatalog.svelte";
  import OperationDetail from "#lib/components/operations/OperationDetail.svelte";
  import OperationsTable from "#lib/components/OperationsTable.svelte";
  import Badge from "#lib/components/ui/Badge.svelte";
  import type { Operation } from "#lib/types/observation.ts";
  let { data } = $props();
  let tab = $state("catalog"),
    busy = $state(false),
    loading = $state(false),
    error = $state(""),
    message = $state("");
  let creationContract = $state<"profile" | "commercial">("profile"),
    plans = $state<Plan[]>([]),
    images = $state<GoldenImage[]>([]);
  let profiles = $state<Profile[]>([]),
    policies = $state<Policy[]>([]),
    usage = $state<Record<string, number>>({});
  let inventoryQuery = $state(""),
    inventoryStatus = $state("all");
  let instances = $state<Instance[]>([]),
    offset = $state(0),
    hasMore = $state(false),
    observedAt = $state("");
  let filteredInstances = $derived(
    instances.filter(
      (i) =>
        (inventoryStatus === "all" || i.status === inventoryStatus) &&
        `${i.name} ${i.instance_id} ${i.vmid ?? ""} ${i.image} ${i.node ?? ""} ${i.ip_addresses.join(" ")}`
          .toLowerCase()
          .includes(inventoryQuery.toLowerCase()),
    ),
  );
  let selected = $state<Instance | null>(null),
    power = $state<{
      power_state: string;
      mutations_available: boolean;
      blocked_reason?: string | null;
      observed_at: string;
    } | null>(null);
  let historyOffset = $state(0);
  let history = $state<Operation[]>([]),
    historyHasMore = $state(false),
    powerError = $state("");
  let product = $state<Profile | null>(null),
    policyId = $state(""),
    name = $state(""),
    vcpus = $state(1),
    memory = $state(512),
    disk = $state(8),
    node = $state(""),
    start = $state(false),
    password = $state(""),
    review = $state(false),
    confirmName = $state("");
  type Intent = {
    id: string;
    action: string;
    status: string;
    instance_id: string | null;
    operation_id: string | null;
    error_code: string | null;
    created_at: string;
    updated_at: string;
  };
  let accessRevoked = $state(false);
  let journal = $state<Intent[]>([]),
    intentKey = $state(""),
    auto = $state(false),
    failures = 0;
  let allowedPolicies = $derived(
    product
      ? policies.filter((p) => activePolicy(p, product!.profile, "create"))
      : [],
  );
  let currentPolicy = $derived(
    policies.find(
      (p) => p.policy_id === (selected?.self_service_policy_id ?? policyId),
    ),
  );
  const actionLabels: Record<string, string> = {
    start: "Encender",
    shutdown: "Apagar",
    reboot: "Reiniciar",
    delete: "Eliminar",
    reconcile: "Observar operación incierta",
  };
  const errors: Record<string, string> = {
    LIVE_DISABLED: "La conexión real está deshabilitada en el servidor.",
    LIVE_NOT_CONFIGURED: "Registra y valida la conexión en API Connections.",
    VALIDATION_REQUIRED: "La conexión requiere validación.",
    REFRESH_BACKOFF:
      "Actualización limitada. Espera antes de volver a consultar.",
    UPSTREAM_UNAUTHORIZED:
      "IACP rechazó la credencial. No se muestran datos anteriores.",
    UPSTREAM_FORBIDDEN:
      "IACP denegó el permiso. Revisa la credencial y su tenant.",
    UPSTREAM_CONFLICT:
      "IACP rechazó la solicitud por estado, cuota, política o fence. Consulta el consumo y la evidencia.",
    UPSTREAM_RATE_LIMITED:
      "IACP limitó la frecuencia. Espera antes de consultar.",
    UPSTREAM_SERVICE_UNAVAILABLE:
      "IACP no está disponible. Un comando puede haber sido admitido; revisa la intención antes de solicitar otro.",
    NON_REAL_INFRASTRUCTURE_REJECTED:
      "IACP devolvió infraestructura simulada. El portal exige infraestructura real.",
  };
  const explain = (code: string) => errors[code] ?? code;
  async function api(path: string, body?: unknown) {
    const response = await fetch(
      "/api/crm/" + path,
      body
        ? {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-CSRF-Token": data.csrf,
            },
            body: JSON.stringify(body),
          }
        : undefined,
    );
    const result = await response.json();
    if (!response.ok) throw new Error(result.error ?? "REQUEST_FAILED");
    return result;
  }
  async function refresh() {
    if (loading || busy) return;
    loading = true;
    accessRevoked = false;
    error = "";
    try {
      if (tab === "catalog") {
        const c = await api("catalog");
        creationContract = c.creationContract;
        plans = c.plans;
        images = c.images;
        profiles = c.profiles;
        policies = c.policies;
        usage = c.usage.usage;
        observedAt = c.observedAt;
      } else if (tab === "instances") {
        if (selected) {
          const d = await api(
            "instances/" +
              selected.instance_id +
              "?operationOffset=" +
              historyOffset,
          );
          selected = d.instance;
          policies = d.policies;
          creationContract = d.creationContract;
          power = d.power;
          powerError = d.powerError ?? "";
          history = d.operations;
          historyHasMore = d.historyHasMore;
          observedAt = d.observedAt;
        } else {
          const d = await api("instances?offset=" + offset);
          instances = d.instances;
          hasMore = d.hasMore;
          observedAt = d.observedAt;
        }
      } else {
        journal = (await api("intents")).intents;
      }
      failures = 0;
    } catch (e) {
      const code = e instanceof Error ? e.message : "REQUEST_FAILED";
      accessRevoked = [
        "UPSTREAM_UNAUTHORIZED",
        "UPSTREAM_FORBIDDEN",
        "UPSTREAM_TENANT_MISMATCH",
      ].includes(code);
      error = explain(code);
      failures = Math.min(failures + 1, 5);
      plans = [];
      images = [];
      profiles = [];
      policies = [];
      selected = null;
      product = null;
      password = "";
      review = false;
      instances = [];
      power = null;
      history = [];
      journal = [];
      observedAt = "";
    } finally {
      loading = false;
    }
  }
  async function switchTab(value: string) {
    tab = value;
    selected = null;
    product = null;
    review = false;
    password = "";
    message = "";
    await refresh();
  }
  function choose(p: Profile) {
    product = p;
    policyId =
      policies.find((x) => activePolicy(x, p.profile, "create"))?.policy_id ??
      "";
    vcpus = 1;
    memory = 512;
    disk = Math.max(8, p.minimum_disk_gb);
    name = "";
    node = "";
    start = false;
    password = "";
    review = false;
    intentKey = crypto.randomUUID();
    message = "";
  }
  async function openInstance(instance: Instance) {
    historyOffset = 0;
    selected = instance;
    power = null;
    confirmName = "";
    history = [];
    tab = "instances";
    await refresh();
  }
  function allowed(action: string) {
    if (
      !data.canOperate ||
      !selected ||
      (!currentPolicy && creationContract !== "commercial") ||
      !power?.mutations_available ||
      freshness(power?.observed_at ?? null) !== "fresh" ||
      selected.status !== "ready" ||
      selected.infrastructure_kind !== "kvm" ||
      (creationContract !== "commercial" &&
        (!currentPolicy ||
          !activePolicy(currentPolicy, selected.network_profile ?? "", action)))
    )
      return false;
    return action === "start"
      ? power.power_state === "stopped"
      : action === "delete"
        ? power.power_state === "stopped" && (selected.vmid ?? 0) >= 30000
        : power.power_state === "running";
  }
  async function submit(action: string) {
    if (busy) return;
    busy = true;
    error = "";
    message = "Enviando solicitud real a IACP…";
    const key = action === "create" ? intentKey : crypto.randomUUID();
    try {
      const payload =
        action === "create" && product
          ? {
              name,
              image: product.image,
              network_profile: product.profile,
              self_service_policy_id: policyId,
              vcpus,
              memory_mb: memory,
              disk_gb: disk,
              start_on_create: start,
              ...(node ? { node_preference: node } : {}),
              ...(password ? { access: { username: "root", password } } : {}),
            }
          : undefined;
      const result = await api("commands", {
        key,
        action,
        ...(action !== "create" ? { instanceId: selected?.instance_id } : {}),
        ...(payload ? { payload } : {}),
        ...(action === "delete" ? { confirmName } : {}),
      });
      message =
        result.admission === "accepted"
          ? `Solicitud aceptada. Operación ${result.operation_id}. Esto no acredita su finalización.`
          : result.status === "uncertain"
            ? `Solicitud incierta (${key}). No se reenviará. Consulta inventario y operaciones antes de crear otra instancia.`
            : `Solicitud ${result.status}: ${explain(result.error ?? "")}`;
      if (result.operation_id) selectedOperation.set(result.operation_id);
      if (action === "create") {
        product = null;
        review = false;
        tab = "recent";
        journal = (await api("intents")).intents;
      }
      confirmName = "";
    } catch (e) {
      error = explain(e instanceof Error ? e.message : "REQUEST_FAILED");
      message = `Intención ${key}. Si se perdió la respuesta, revisa Operaciones recientes antes de volver a enviar.`;
    } finally {
      password = "";
      busy = false;
    }
  }
  onMount(() => {
    if (page.url.searchParams.get("view") === "instances") tab = "instances";
    const id = page.url.searchParams.get("instance");
    if (id && /^[a-f0-9-]{36}$/.test(id)) {
      tab = "instances";
      void api("instances/" + id)
        .then((d) => {
          selected = d.instance;
          policies = d.policies;
          creationContract = d.creationContract;
          power = d.power;
          history = d.operations;
          observedAt = d.observedAt;
        })
        .catch((e) => (error = explain(e.message)));
    } else void refresh();
    return scheduleReads({
      key: "crm-read-loop",
      enabled: () => auto && !product && !busy && !accessRevoked,
      interval: () => 10000,
      read: async () => {
        await refresh();
        return !error;
      },
    });
  });
</script>

<svelte:head><title>CRM Simulator · IaCoC</title></svelte:head>
<div class="page-heading">
  <div>
    <div class="eyebrow">CRM SIMULATOR <span>/</span> IACP</div>
    <h1>CRM Simulator</h1>
    <p>Catálogo y servicios del tenant autorizado.</p>
  </div>
  <div class="heading-actions">
    <button class="button" disabled={loading || busy} onclick={refresh}
      >{loading ? "Consultando…" : "Actualizar"}</button
    >
  </div>
</div>
<div class="callout warning">
  <strong>Infraestructura real.</strong> Crear, encender, apagar, reiniciar y eliminar
  generan operaciones reales en IACP. La aceptación no acredita finalización.
</div>
<div class="filter-tabs">
  {#each [{ id: "catalog", label: "Catálogo" }, { id: "instances", label: "Mis instancias" }, { id: "recent", label: "Operaciones recientes" }] as item}<button
      class:chosen={tab === item.id}
      onclick={() => switchTab(item.id)}
      disabled={busy}>{item.label}</button
    >{/each}
</div>
{#if error}<div class="callout warning" role="alert">{error}</div>{/if}
{#if message}<div class="callout" role="status">{message}</div>{/if}
{#if !data.canOperate}<div class="callout">
    Acceso de observación. Las operaciones requieren Administrator local y una
    credencial operator dedicada configurada en API Connections.
  </div>{/if}
{#if tab === "catalog"}
  {#if creationContract === "commercial"}
    <CommercialCatalog
      {plans}
      {images}
      {profiles}
      {usage}
      canOperate={data.canOperate}
      csrf={data.csrf}
      onaccepted={async (result) => {
        message =
          result.admission === "accepted"
            ? `Solicitud aceptada. Operación ${result.operation_id}; aún no acredita finalización.`
            : `Solicitud ${result.status}: ${result.error ?? ""}. No reenviar automáticamente.`;
        if (result.operation_id) selectedOperation.set(result.operation_id);
        tab = "recent";
        await refresh();
      }}
    />
  {:else if product}
    <section class="panel">
      <div class="panel-heading">
        <h2>
          {review ? "Revisar solicitud" : "Configurar KVM"} · {product.profile}
        </h2>
      </div>
      <form
        class="form-body"
        onsubmit={(e) => {
          e.preventDefault();
          if (review) void submit("create");
          else review = true;
        }}
      >
        <p>
          Imagen {product.image} · Red {product.network_mode} / {product.profile}.
          Disponibilidad del proveedor no publicada; IACP valida la admisión.
        </p>
        <label
          >Nombre de instancia<input
            required
            maxlength="63"
            pattern="[a-z0-9]([a-z0-9-]*[a-z0-9])?"
            bind:value={name}
            disabled={review || busy}
          /></label
        >
        <label
          >Política autorizada<select
            required
            bind:value={policyId}
            disabled={review || busy}
            >{#each allowedPolicies as p}<option value={p.policy_id}
                >{p.policy_id} · vence {formatTime(p.expires_at)}</option
              >{/each}</select
          ></label
        >
        <label
          >CPU<input
            type="number"
            required
            min="1"
            max={product.max_vcpus_per_instance}
            step="1"
            bind:value={vcpus}
            disabled={review || busy}
          /></label
        >
        <label
          >RAM (MB)<input
            type="number"
            required
            min="512"
            max={product.max_memory_mb_per_instance}
            step="256"
            bind:value={memory}
            disabled={review || busy}
          /></label
        >
        <label
          >Disco (GB)<input
            type="number"
            required
            min={Math.max(8, product.minimum_disk_gb)}
            max={product.max_disk_gb_per_instance}
            step="1"
            bind:value={disk}
            disabled={review || busy}
          /></label
        >
        <label
          >Nodo autorizado<select bind:value={node} disabled={review || busy}
            ><option value="">Selección automática de IACP</option
            >{#each product.nodes as n}<option value={n}>{n}</option
              >{/each}</select
          ></label
        >
        {#if product.root_password_bootstrap}<label
            >Contraseña inicial root (opcional)<input
              type="password"
              autocomplete="new-password"
              minlength="16"
              maxlength="128"
              bind:value={password}
              disabled={review || busy}
            /><small
              >Solo entrada HTTPS. IACP puede conservarla en plan/state de
              laboratorio; nunca se devuelve. Se borra del formulario al enviar.</small
            ></label
          >{/if}
        <label
          ><input
            type="checkbox"
            bind:checked={start}
            disabled={review ||
              busy ||
              !allowedPolicies.some(
                (p) =>
                  p.policy_id === policyId &&
                  activePolicy(p, product!.profile, "start"),
              )}
          /> Solicitar arranque posterior mediante Lifecycle</label
        >
        {#if review}<div class="callout warning">
            Crear una instancia nueva: {name} · {vcpus} CPU · {memory} MB · {disk}
            GB. No restaura discos, datos, identidad ni IP anteriores. Clave de intención:
            {intentKey}.
          </div>{/if}
        <div class="heading-actions">
          <button
            class="button primary"
            disabled={busy || !data.canOperate || !policyId}
            >{busy
              ? "Enviando…"
              : review
                ? "Crear instancia real"
                : "Revisar"}</button
          ><button
            type="button"
            class="button"
            disabled={busy}
            onclick={() => {
              if (review) review = false;
              else {
                product = null;
                password = "";
              }
            }}>{review ? "Editar" : "Cancelar"}</button
          >
        </div>
      </form>
    </section>
  {:else}
    <section class="panel">
      <div class="panel-heading">
        <h2>Perfiles publicados por IACP</h2>
        <span>CT / LXD: no disponible en el contrato</span>
      </div>
      {#each profiles as p}<div class="form-body">
          <h3>{p.profile} · KVM</h3>
          <p>
            Imagen: {p.image} · CPU 1–{p.max_vcpus_per_instance} · RAM 512–{p.max_memory_mb_per_instance}
            MB · Disco {p.minimum_disk_gb}–{p.max_disk_gb_per_instance} GB
          </p>
          <p>
            Red {p.network_mode} · Bridge {p.bridge} · VLAN {p.vlan_tag ??
              "sin etiqueta"} · Nodos {p.nodes.join(", ")}
          </p>
          <p>
            Inicialización: {p.guest_initialization ?? "no publicada"} · Autoservicio
            {p.self_service_enabled ? "habilitado" : "deshabilitado"} · Disponibilidad
            del proveedor: no publicada.
          </p>
          <dl class="detail-grid">
            {#each Object.entries(p.quotas) as [resource, limit]}<div>
                <dt>{resource}</dt>
                <dd>
                  Límite {limit} · consumo {usage[resource] ?? "no publicado"}
                </dd>
              </div>{/each}
          </dl>
          <button
            class="button primary"
            disabled={!data.canOperate ||
              !p.self_service_enabled ||
              !policies.some((x) => activePolicy(x, p.profile, "create")) ||
              loading}
            onclick={() => choose(p)}>Seleccionar producto</button
          >
          <p>
            {policies.some((x) => activePolicy(x, p.profile, "create"))
              ? "Sujeto a cuotas, políticas y habilitación de IACP."
              : "Sin política create vigente. No disponible para solicitar."}
          </p>
        </div>{:else}<div class="form-body">
          <p>
            No hay catálogo autorizado cargado. Consulta la conexión y
            actualiza.
          </p>
        </div>{/each}
    </section>
  {/if}
{:else if tab === "instances"}
  {#if selected}
    <section class="panel">
      <div class="panel-heading">
        <h2>{selected.name}</h2>
        <button
          class="button"
          onclick={() => {
            selected = null;
            void refresh();
          }}>Volver al inventario</button
        >
      </div>
      <div class="form-body">
        <dl class="detail-grid">
          {#each [["ID", selected.instance_id], ["VMID", selected.vmid ?? "desconocido"], ["Tipo", selected.infrastructure_kind], ["Imagen", selected.image], ["Provisión", selected.status], ["Energía", power?.power_state ?? "desconocida"], ["Nodo", selected.node ?? "desconocido"], ["IP conocida", selected.ip_addresses.join(", ") || "pendiente / desconocida"], ["Red", selected.network_mode], ["Recursos", `${selected.vcpus} CPU / ${selected.memory_mb} MB / ${selected.disk_gb} GB`], ["Creación", formatTime(selected.created_at)], ["Última actualización", formatTime(selected.updated_at)]] as [label, value]}<div
            >
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>{/each}
        </dl>
        <p title={utcTime(power?.observed_at)}>
          Evidencia de energía: {formatTime(power?.observed_at)}. VM creada no
          acredita VM arrancada; energía running no acredita inicialización ni
          acceso del invitado.
        </p>
        <p>
          Diagnóstico: {power?.blocked_reason ??
            powerError ??
            "sin evidencia adicional"}. Guest Agent / Cloud-Init / acceso:
          desconocidos según contrato de energía.
        </p>
        {#if selected.access}<p title={utcTime(selected.access.observed_at)}>
            Verificación de acceso: {selected.access.status}. Cloud-Init: {selected
              .access.cloud_init_complete === true
              ? "verificado"
              : selected.access.cloud_init_complete === false
                ? "no verificado"
                : "desconocido"}. SSH autenticado: {selected.access
              .ssh_authenticated === true
              ? "verificado"
              : selected.access.ssh_authenticated === false
                ? "no verificado"
                : "desconocido"}. Evidencia: {formatTime(
              selected.access.observed_at,
            )}. {selected.access.error_code ?? ""}
          </p>{/if}
        <div class="heading-actions">
          {#each ["start", "shutdown", "reboot"] as action}<button
              class="button"
              disabled={busy || loading || !!error || !allowed(action)}
              onclick={() => submit(action)}>{actionLabels[action]}</button
            >{/each}<button
            class="button"
            disabled={busy ||
              !data.canOperate ||
              !history.some((o) => o.normalized_status === "uncertain")}
            onclick={() => submit("reconcile")}
            >Observar operación incierta</button
          >
        </div>
        <a
          class="button"
          href={`/api/reports/instances/${selected.instance_id}`}
          >Exportar reporte JSON</a
        >
        <details>
          <summary>Eliminar esta instancia</summary>
          <p>
            Eliminar {selected.name} ({selected.instance_id}, VMID {selected.vmid ??
              "desconocido"}) destruye la infraestructura y puede perder sus
            discos y datos. IACP exige propiedad, política delete, estado
            apagado y fences.
          </p>
          <label
            >Escribe el nombre para confirmar<input
              bind:value={confirmName}
            /></label
          ><button
            class="button"
            disabled={busy ||
              loading ||
              !!error ||
              !allowed("delete") ||
              confirmName !== selected.name}
            onclick={() => submit("delete")}>Eliminar instancia real</button
          >
        </details>
        <a
          class="text-link"
          href="/crm"
          onclick={(e) => {
            e.preventDefault();
            void switchTab("catalog");
          }}>Volver a crear: seleccionar producto para una instancia nueva</a
        >
        <a class="text-link" href={`/events?instance=${selected.instance_id}`}
          >Eventos asociados</a
        >
      </div>
    </section>
    <section class="panel">
      <div class="panel-heading">
        <h2>Historial de operaciones</h2>
        <span
          >{historyHasMore
            ? "Hay más operaciones; usa Más historial"
            : "Página consultada"}</span
        >
      </div>
      <OperationsTable operations={history} />
      <div class="table-footer">
        <button
          class="button"
          disabled={loading || historyOffset === 0}
          onclick={() => {
            historyOffset = Math.max(0, historyOffset - 50);
            void refresh();
          }}>Historial anterior</button
        ><span>Desde {historyOffset}</span><button
          class="button"
          disabled={loading || !historyHasMore}
          onclick={() => {
            historyOffset += 50;
            void refresh();
          }}>Más historial</button
        >
      </div>
    </section>
  {:else}
    <section class="panel">
      <div class="panel-heading">
        <h2>Inventario autorizado</h2>
        <span>Página desde {offset}; la provisión no indica energía actual</span
        >
      </div>
      <div class="toolbar">
        <label class="search-field"
          >Buscar instancias<input
            aria-label="Buscar instancias"
            placeholder="Nombre, UUID, VMID, IP o nodo…"
            bind:value={inventoryQuery}
          /></label
        ><select aria-label="Filtrar provisión" bind:value={inventoryStatus}
          ><option value="all">Todos los estados</option
          >{#each ["pending", "provisioning", "ready", "failed", "deleting", "deleted"] as status}<option
              value={status}>{status}</option
            >{/each}</select
        ><span>{filteredInstances.length} resultados en esta página</span>
      </div>
      <div class="table-wrap">
        <table>
          <thead
            ><tr
              ><th>Instancia</th><th>Tipo / imagen</th><th>Provisión</th><th
                >VMID / nodo / IP</th
              ><th>Recursos</th><th>Última evidencia</th></tr
            ></thead
          ><tbody
            >{#each filteredInstances as i}<tr
                ><td
                  ><button
                    class="operation-link"
                    onclick={() => openInstance(i)}>{i.name}</button
                  ><small>{i.instance_id}</small></td
                ><td>{i.infrastructure_kind}<small>{i.image}</small></td><td
                  ><Badge value={i.status} /><small
                    >Energía: consultar detalle</small
                  ></td
                ><td
                  >{i.vmid ?? "desconocido"} / {i.node ?? "desconocido"}<small
                    >{i.ip_addresses.join(", ") || "IP pendiente"}</small
                  ></td
                ><td>{i.vcpus} CPU / {i.memory_mb} MB / {i.disk_gb} GB</td><td
                  title={utcTime(i.updated_at)}>{formatTime(i.updated_at)}</td
                ></tr
              >{:else}<tr
                ><td colspan="6">Sin instancias cargadas en esta página.</td
                ></tr
              >{/each}</tbody
          >
        </table>
      </div>
      <div class="table-footer">
        <button
          class="button"
          disabled={loading || offset === 0}
          onclick={() => {
            offset = Math.max(0, offset - 100);
            void refresh();
          }}>Anterior</button
        ><button
          class="button"
          disabled={loading || !hasMore}
          onclick={() => {
            offset += 100;
            void refresh();
          }}>Siguiente</button
        >
      </div>
    </section>
  {/if}
{:else}
  <section class="panel">
    <div class="panel-heading">
      <h2>Intenciones emitidas desde IaCoC</h2>
      <a class="text-link" href="/operations">Todas las operaciones en IACP</a>
    </div>
    <div class="table-wrap">
      <table>
        <thead
          ><tr
            ><th>Intención</th><th>Acción</th><th>Admisión</th><th>Evidencia</th
            ><th>Fecha</th></tr
          ></thead
        ><tbody
          >{#each journal as i}<tr
              ><td>{i.id}</td><td>{i.action}</td><td
                >{i.status}<small
                  >{i.error_code ? explain(i.error_code) : ""}</small
                ></td
              ><td
                >{#if i.operation_id}<button
                    class="operation-link"
                    onclick={() => selectedOperation.set(i.operation_id)}
                    >Consultar operación {i.operation_id}</button
                  >{/if}{#if i.instance_id}<a
                    class="text-link"
                    href={`/crm?instance=${i.instance_id}`}
                    >Instancia {i.instance_id}</a
                  >{/if}{#if i.status === "uncertain"}<small
                    >No reenviar ni crear otra VM. Consulta inventario e IACP
                    sobre la intención original.</small
                  >{/if}</td
              ><td title={utcTime(i.updated_at)}>{formatTime(i.updated_at)}</td
              ></tr
            >{:else}<tr
              ><td colspan="5"
                >No hay intenciones locales cargadas. El historial de IACP se
                consulta en Operations.</td
              ></tr
            >{/each}</tbody
        >
      </table>
    </div>
  </section>
{/if}
<footer class="evidence-footer">
  <span title={utcTime(observedAt)}
    >Consulta: {formatTime(observedAt)} · datos paginados; no es un flujo en tiempo
    real</span
  ><label
    ><input type="checkbox" bind:checked={auto} /> Actualización periódica (10–60
    s, solo lectura)</label
  >
</footer>
<OperationDetail
  operationId={$selectedOperation}
  operation={history.find((o) => o.operation_id === $selectedOperation) ?? null}
  events={data.events}
  onclose={() => selectedOperation.set(null)}
/>
