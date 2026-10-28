<script lang="ts">
  import { scheduleReads } from "#lib/refresh.ts";
  import { onMount } from "svelte";
  import { page } from "$app/state";
  import { freshness } from "#lib/types/observation.ts";
  import {
    hasActiveOperation,
    isTemporaryPowerFailure,
    isTransientReadFailure,
    networkEvidence,
    powerStatusMessage,
  } from "#lib/crm/state.ts";
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
  import EvidenceClock from "#lib/components/ui/EvidenceClock.svelte";
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
    usage = $state<Record<string, number> | null>(null);
  let inventoryQuery = $state(""),
    inventorySearch = $state(""),
    inventoryStatus = $state("active");
  let instances = $state<Instance[]>([]),
    offset = $state(0),
    hasMore = $state(false),
    observedAt = $state("");
  let filteredInstances = $derived(
    instances.filter(
      (i) =>
        (inventoryStatus === "all"
          ? true
          : inventoryStatus === "active"
            ? !["deleted", "deleting"].includes(i.status)
            : i.status === inventoryStatus) &&
        `${i.name} ${i.instance_id} ${i.vmid ?? ""} ${i.image} ${i.node ?? ""} ${networkEvidence(i).addresses.join(" ")}`
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
  let selectedNetwork = $derived(selected ? networkEvidence(selected) : null);
  let capabilities = $state<string[]>([]);
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
    diagnostic?: {
      status: number | null;
      requestId: string | null;
      upstreamRequestId: string | null;
      server: string | null;
      detail: string | null;
      durationMs: number | null;
    } | null;
    created_at: string;
    updated_at: string;
  };
  let accessRevoked = $state(false);
  let staleObservation = $state(false);
  let journal = $state<Intent[]>([]),
    intentKey = $state(""),
    auto = $state(true),
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
    discover: "Descubrir IP",
    initialize: "Solicitar inicialización",
    verifyAccess: "Verificar acceso",
    provision: "Continuar aprovisionamiento",
    retryProvision: "Reintentar planificación",
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
    UPSTREAM_HTTP_ERROR:
      "IACP o su proxy devolvió un error temporal. Se conserva la última observación y no se habilitan mutaciones.",
    UPSTREAM_READ_ERROR:
      "La lectura de IACP se interrumpió. Se conserva la última observación y se volverá a consultar.",
    UPSTREAM_TIMEOUT:
      "La consulta de IACP agotó su tiempo. No se interpreta como un fallo de la VM.",
    UPSTREAM_UNAVAILABLE:
      "IACP no respondió. Se conserva la última observación y se volverá a consultar.",
    UPSTREAM_NOT_READY:
      "IACP aún no está listo. La solicitud no se reintentó automáticamente.",
    UPSTREAM_CONTRACT_ERROR:
      "La respuesta de IACP no coincide con el contrato publicado. No se envió la solicitud.",
    UPSTREAM_INVALID_RESPONSE:
      "IACP devolvió una respuesta inválida. Revisa la conexión y su versión de contrato.",
    REQUEST_TIMEOUT:
      "IACP no respondió dentro del tiempo límite. Consulta Operaciones antes de volver a enviar.",
    CONNECTION_REQUIRED:
      "Conecta y valida IACP antes de solicitar una operación.",
    POWER_STATE_BLOCKED:
      "IACP no autoriza esta acción con la evidencia actual de energía.",
    POWER_INSTANCE_NOT_AUTHORIZED:
      "IACP no autorizó la consulta o la operación de energía para esta instancia.",
    COMMERCIAL_OWNERSHIP_BINDING_CHANGED:
      "IACP detectó un cambio en la vinculación comercial de la instancia. Las acciones permanecen bloqueadas hasta que IACP confirme nuevamente la pertenencia y autorización.",
    POWER_PROXMOX_UNAVAILABLE:
      "El proveedor de energía no está disponible. No se interpreta como una denegación de permisos.",
    NON_REAL_INFRASTRUCTURE_REJECTED:
      "IACP devolvió infraestructura simulada. El portal exige infraestructura real.",
  };
  const explain = (code: string) => errors[code] ?? code;
  function diagnosticNotice(result: unknown) {
    const diagnostic = (
      result as {
        diagnostic?: {
          status?: number | null;
          requestId?: string | null;
          upstreamRequestId?: string | null;
          detail?: string | null;
          durationMs?: number | null;
        } | null;
      }
    ).diagnostic;
    if (!diagnostic) return "";
    const parts = [
      diagnostic.status ? `HTTP ${diagnostic.status}` : "",
      diagnostic.detail ?? "",
      diagnostic.durationMs != null ? `${diagnostic.durationMs} ms` : "",
      diagnostic.upstreamRequestId
        ? `correlación ${diagnostic.upstreamRequestId}`
        : diagnostic.requestId
          ? `solicitud ${diagnostic.requestId}`
          : "",
    ].filter(Boolean);
    return parts.length ? ` [${parts.join(" · ")}]` : "";
  }
  let readController: AbortController | null = null;
  let requestEpoch = 0,
    lastRequestMs = $state<number | null>(null);
  async function api(path: string, body?: unknown, signal?: AbortSignal) {
    const started = performance.now();
    const timeoutSignal = AbortSignal.timeout(body ? 45000 : 30000);
    const requestSignal = signal
      ? AbortSignal.any([signal, timeoutSignal])
      : timeoutSignal;
    try {
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
              signal: requestSignal,
            }
          : { signal: requestSignal },
      );
      const result = await response.json();
      if (!response.ok) {
        const failure = Object.assign(
          new Error(result.error ?? "REQUEST_FAILED"),
          { status: response.status, diagnostic: result.diagnostic },
        );
        throw failure;
      }
      return result;
    } catch (e) {
      if (timeoutSignal.aborted && !signal?.aborted)
        throw new Error("REQUEST_TIMEOUT");
      throw e;
    } finally {
      lastRequestMs = Math.round(performance.now() - started);
    }
  }
  async function refresh() {
    if (loading || busy) return;
    loading = true;
    const epoch = ++requestEpoch;
    const controller = new AbortController();
    readController = controller;
    accessRevoked = false;
    error = "";
    try {
      if (tab === "catalog") {
        const c = await api("catalog", undefined, controller.signal);
        creationContract = c.creationContract;
        plans = c.plans;
        images = c.images;
        profiles = c.profiles;
        policies = c.policies;
        usage = c.usage?.usage ?? null;
        observedAt = c.observedAt;
        staleObservation = false;
      } else if (tab === "instances") {
        if (selected) {
          const d = await api(
            "instances/" +
              selected.instance_id +
              "?operationOffset=" +
              historyOffset,
            undefined,
            controller.signal,
          );
          capabilities = d.capabilities ?? [];
          selected = d.instance;
          policies = d.policies;
          creationContract = d.creationContract;
          if (d.power) power = d.power;
          else if (!d.powerError || !isTemporaryPowerFailure(d.powerError))
            power = null;
          powerError = d.powerError ?? "";
          history = d.operations;
          historyHasMore = d.historyHasMore;
          observedAt = d.observedAt;
          staleObservation =
            !!d.powerError && isTemporaryPowerFailure(d.powerError);
        } else {
          const inventoryPath =
            "instances?offset=" +
            offset +
            (inventorySearch
              ? "&q=" + encodeURIComponent(inventorySearch)
              : "");
          const d = await api(inventoryPath, undefined, controller.signal);
          instances = d.instances;
          hasMore = d.hasMore;
          observedAt = d.observedAt;
          staleObservation = false;
        }
      } else {
        journal = (await api("intents", undefined, controller.signal)).intents;
        staleObservation = false;
      }
      failures = 0;
    } catch (e) {
      if (controller.signal.aborted || epoch !== requestEpoch) return;
      const code = e instanceof Error ? e.message : "REQUEST_FAILED";
      const failure = e as Error & {
        status?: number;
        diagnostic?: { status?: number | null } | null;
      };
      accessRevoked = [
        "UPSTREAM_UNAUTHORIZED",
        "UPSTREAM_FORBIDDEN",
        "UPSTREAM_TENANT_MISMATCH",
      ].includes(code);
      error = explain(code);
      failures = Math.min(failures + 1, 5);
      staleObservation = isTransientReadFailure(
        code,
        failure.diagnostic?.status ?? failure.status,
      );
      if (accessRevoked) {
        plans = [];
        images = [];
        profiles = [];
        policies = [];
        usage = null;
        selected = null;
        product = null;
        password = "";
        review = false;
        instances = [];
        power = null;
        history = [];
        journal = [];
        observedAt = "";
        staleObservation = false;
      }
    } finally {
      if (epoch === requestEpoch) loading = false;
    }
  }
  async function switchTab(value: string) {
    readController?.abort();
    requestEpoch++;
    loading = false;
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
      hasActiveOperation(history) ||
      !data.canOperate ||
      !selected ||
      (!currentPolicy && creationContract !== "commercial") ||
      !power?.mutations_available ||
      staleObservation ||
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
        ? power.power_state === "stopped"
        : power.power_state === "running";
  }
  const creationOperation = $derived(
    history.find((o) => o.kind === "instance.create"),
  );
  async function submit(action: string) {
    if (busy) return;
    busy = true;
    error = "";
    message = "Enviando solicitud real a IACP…";
    const key = action === "create" ? intentKey : crypto.randomUUID();
    try {
      const payload =
        action === "retryProvision"
          ? { expected_attempt: creationOperation?.provisioning?.attempt }
          : action === "create" && product
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
        ...(["provision", "retryProvision"].includes(action)
          ? {
              confirmName: selected?.name,
              recoveryOperationId: creationOperation?.operation_id,
              expectedOperationUpdatedAt: creationOperation?.updated_at,
              expectedInstanceUpdatedAt: selected?.updated_at,
            }
          : {}),
      });
      message =
        result.admission === "accepted"
          ? `Solicitud aceptada. Operación ${result.operation_id}. Esto no acredita su finalización.`
          : result.status === "uncertain"
            ? `Solicitud incierta (${key}). No se reenviará. Consulta inventario y operaciones antes de crear otra instancia.${diagnosticNotice(result)}`
            : `Solicitud ${result.status}: ${explain(result.error ?? "")}${diagnosticNotice(result)}`;
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
          capabilities = d.capabilities ?? [];
          selected = d.instance;
          policies = d.policies;
          creationContract = d.creationContract;
          power = d.power;
          powerError = d.powerError ?? "";
          history = d.operations;
          historyHasMore = d.historyHasMore;
          observedAt = d.observedAt;
          staleObservation =
            !!d.powerError && isTemporaryPowerFailure(d.powerError);
        })
        .catch((e) => (error = explain(e.message)));
    } else void refresh();
    const stop = scheduleReads({
      key: "crm-read-loop",
      enabled: () => auto && !product && !busy && !accessRevoked,
      interval: () => {
        // OperationDetail is the authoritative poller while its modal is
        // open.  Keep a slow instance refresh only when a resource is already
        // selected, and let its terminal callback refresh immediately.
        if ($selectedOperation) return selected ? 15000 : 30000;
        return hasActiveOperation(history) ? 4000 : 30000;
      },
      read: async () => {
        if ($selectedOperation && !selected) return true;
        await refresh();
        return !error;
      },
    });
    return () => {
      readController?.abort();
      requestEpoch++;
      stop();
    };
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
    Conecta y valida la única integración Bearer de IACP para solicitar acciones
    desde este portal. IACP conserva la autorización final de cada operación.
    <a class="text-link" href="/administration/connections"
      >Administrar conexión IACP</a
    >
  </div>{/if}
{#if loading && tab === "catalog" && !plans.length}<section
    class="panel form-body"
    aria-busy="true"
    aria-label="Cargando catálogo IACP"
  >
    <div class="skeleton" style="width: 32%;"></div>
    <div class="skeleton" style="width: 78%; margin-top: 16px;"></div>
    <div class="skeleton" style="width: 64%; margin-top: 12px;"></div>
    <p class="muted" style="margin-top: 18px;">
      Consultando catálogo publicado por IACP…
    </p>
  </section>{/if}
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
            : `Solicitud ${result.status}: ${result.error ?? ""}${diagnosticNotice(result)}. No reenviar automáticamente.`;
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
            pattern="[a-z0-9]([a-z0-9\-]*[a-z0-9])?"
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
                  Límite {limit} · consumo {usage?.[resource] ?? "no publicado"}
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
          {#each [["ID", selected.instance_id], ["VMID", selected.vmid ?? "desconocido"], ["Tipo", selected.infrastructure_kind], ["Imagen", selected.image], ["Provisión", selected.status], ["Energía", power?.power_state ?? "desconocida"], ["Nodo", selected.node ?? "desconocido"], ["IP conocida", selectedNetwork?.addresses.join(", ") || "IACP no la publicó"], ["Red", selected.network_mode], ["Recursos", `${selected.vcpus} CPU / ${selected.memory_mb} MB / ${selected.disk_gb} GB`], ["Creación", formatTime(selected.created_at)], ["Última actualización", formatTime(selected.updated_at)]] as [label, value]}<div
            >
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>{/each}
        </dl>
        {#if selectedNetwork}<p class="micro muted" role="status">
            Evidencia de red: {selectedNetwork.source}. {#if selectedNetwork.observedAt}
              Observada {formatTime(selectedNetwork.observedAt)}.
            {:else if selectedNetwork.source === "not_published"}
              IACP todavía no publicó una dirección en los campos contractuales.
              {#if selectedNetwork.status}
                Estado: {selectedNetwork.status}.{/if}
              {#if selectedNetwork.reason}
                Motivo: {selectedNetwork.reason}.{/if}
            {/if}
          </p>{/if}
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
        {#if power?.blocked_reason === "COMMERCIAL_OWNERSHIP_BINDING_CHANGED"}<div
            class="callout warning"
            role="alert"
          >
            IACP no autoriza acciones sobre esta instancia porque cambió la
            vinculación comercial publicada. IaCoC no sustituye esa decisión ni
            enviará comandos hasta que una lectura autoritativa de IACP confirme
            la pertenencia actual.
          </div>{/if}
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
        <p class="micro muted" role="status">
          {!data.canOperate
            ? "Falta validar la conexión Bearer única de IACP."
            : selected.status !== "ready"
              ? `Estado actual ${selected.status}: las acciones de energía no están disponibles.`
              : staleObservation
                ? powerStatusMessage(
                    powerError,
                    power?.blocked_reason,
                    staleObservation,
                  )
                : !power?.mutations_available
                  ? powerStatusMessage(powerError, power?.blocked_reason, false)
                  : freshness(power.observed_at) !== "fresh"
                    ? powerStatusMessage(
                        powerError,
                        power?.blocked_reason,
                        true,
                      )
                    : `IACP observó ${power.power_state}. Encender requiere stopped; apagar y reiniciar requieren running.`}
        </p>
        {#if hasActiveOperation(history)}<p class="callout" role="status">
            IACP informa una operación o entrega en curso. La operación raíz
            completada no acredita invitado listo. Espera la evidencia de
            entrega y actualiza.
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
              !!error ||
              loading ||
              ["deleted", "deleting"].includes(selected.status) ||
              !history.some(
                (o) =>
                  o.normalized_status === "uncertain" && o.recovery_required,
              )}
            onclick={() => {
              if (
                selected &&
                confirm(
                  `Solicitar observación de ${selected.name} (${selected.instance_id}). No repite el aprovisionamiento.`,
                )
              )
                void submit("reconcile");
            }}>Observar operación incierta</button
          >
        </div>
        <a
          class="button"
          href={`/api/reports/instances/${selected.instance_id}`}
          >Exportar reporte JSON</a
        >
        <details>
          <summary>Red, acceso y continuación autorizada por IACP</summary>
          <p>
            Se solicitan operaciones API sobre esta instancia. No se envían
            comandos del invitado ni configuración de hardware. IACP valida
            propiedad, permisos, locks y precondiciones.
          </p>
          {#each ["discover", "verifyAccess", "initialize", "provision", "retryProvision"] as action}
            <button
              class="button"
              disabled={busy ||
                loading ||
                !!error ||
                !data.canOperate ||
                ["deleted", "deleting"].includes(selected.status) ||
                !capabilities.includes(action) ||
                (["provision", "retryProvision"].includes(action) &&
                  (!creationOperation?.provisioning ||
                    creationOperation.normalized_status === "uncertain")) ||
                (action === "retryProvision" &&
                  (creationOperation?.normalized_status !== "failed" ||
                    creationOperation.provisioning?.phase !== "failed" ||
                    !!creationOperation.provisioning?.started_at)) ||
                (action === "initialize" &&
                  history.some(
                    (o) =>
                      !!o.initialization &&
                      ["queued", "running", "uncertain"].includes(
                        o.initialization.status,
                      ),
                  ))}
              onclick={() => {
                if (
                  selected &&
                  confirm(
                    `${actionLabels[action]}: ${selected.name} (${selected.instance_id}). IACP determina su elegibilidad. No repite creación ni modifica hardware desde IaCoC.`,
                  )
                )
                  void submit(action);
              }}>{actionLabels[action]}</button
            >
          {/each}
          <p class="micro muted">
            Una inicialización incierta se consulta por su operación; no se
            repite con una clave nueva. Reintentar planificación exige intento
            publicado y sin evidencia de ejecución consumida; IACP conserva el
            fence definitivo.
          </p>
        </details>
        <details>
          <summary>Eliminar esta instancia</summary>
          <p>
            Eliminar {selected.name} ({selected.instance_id}, VMID {selected.vmid ??
              "desconocido"}) destruye la infraestructura y puede perder sus
            discos y datos. IACP exige propiedad, autorización, estado apagado y
            fences.
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
            onkeydown={(event) => {
              if (event.key === "Enter") {
                inventorySearch = inventoryQuery.trim();
                offset = 0;
                void refresh();
              }
            }}
          /></label
        ><button
          class="button"
          disabled={loading}
          onclick={() => {
            inventorySearch = inventoryQuery.trim();
            offset = 0;
            void refresh();
          }}>Buscar todo el inventario</button
        ><select aria-label="Filtrar provisión" bind:value={inventoryStatus}
          ><option value="active">Activas</option><option value="all"
            >Todos los estados</option
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
                    >{networkEvidence(i).addresses.join(", ") ||
                      "IACP no publicó IP"}</small
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
                >{i.status}{#if i.error_code}<small
                    >{explain(i.error_code)}</small
                  >{/if}{#if i.diagnostic?.status}<small
                    >Upstream HTTP {i.diagnostic.status}{i.diagnostic.detail
                      ? ` · ${i.diagnostic.detail}`
                      : ""}{i.diagnostic.durationMs != null
                      ? ` · ${i.diagnostic.durationMs} ms`
                      : ""}</small
                  >{/if}</td
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
<EvidenceClock {observedAt} />
<footer class="evidence-footer">
  <span title={utcTime(observedAt)}
    >Consulta: {formatTime(observedAt)} · datos paginados; actualización por consultas
    a IACP</span
  ><label
    ><input type="checkbox" bind:checked={auto} /> Actualización periódica (activas
    4 s; resto 30 s; backoff)</label
  >{#if lastRequestMs !== null}<span>Última solicitud: {lastRequestMs} ms</span
    >{/if}
</footer>
<OperationDetail
  operationId={$selectedOperation}
  operation={history.find((o) => o.operation_id === $selectedOperation) ?? null}
  events={data.events}
  onclose={() => {
    selectedOperation.set(null);
    // OperationDetail already performed the authoritative operation read.
    // A creation detail has no selected instance to reconcile yet, so avoid
    // an extra full CRM read that can race the next explicit observation.
    if (selected) void refresh();
  }}
  onsettled={() => (selected ? refresh() : Promise.resolve())}
/>
