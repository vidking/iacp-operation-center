<script lang="ts">
  import type { Plan, GoldenImage, Profile } from "#lib/types/crm.ts";
  import { connectionMessage } from "#lib/types/connection-diagnostics.ts";
  let {
    plans,
    images,
    profiles,
    usage,
    canOperate,
    csrf,
    onaccepted,
  }: {
    plans: Plan[];
    images: GoldenImage[];
    profiles: Profile[];
    usage: Record<string, number> | null;
    canOperate: boolean;
    csrf: string;
    onaccepted: (result: {
      admission?: string;
      operation_id?: string;
      status?: string;
      error?: string;
    }) => void;
  } = $props();
  let selected = $state<string | null>(null),
    imageId = $state(""),
    name = $state(""),
    password = $state(""),
    publicKeys = $state(""),
    start = $state(false),
    review = $state(false),
    busy = $state(false),
    error = $state(""),
    key = $state(""),
    lastRequestMs = $state<number | null>(null);
  let networkProfile = $state("lab-dhcp"),
    ipv4 = $state(""),
    prefix = $state(24),
    gateway = $state(""),
    orderId = $state(""),
    productId = $state("");
  let plan = $derived(plans.find((p) => p.plan_id === selected));
  function diagnosticText(value: unknown) {
    if (!value || typeof value !== "object") return "";
    const diagnostic = value as {
      status?: number | null;
      detail?: string | null;
      upstreamRequestId?: string | null;
      requestId?: string | null;
      durationMs?: number | null;
    };
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
  const selectableImage = (image: GoldenImage) =>
    ["certificada", "habilitada"].includes(image.status) &&
    image.authorized &&
    image.availability.available;
  let compatible = $derived(
    images.filter(
      (i) =>
        selectableImage(i) &&
        i.compatible_plans.includes(selected ?? "") &&
        i.availability.available,
    ),
  );
  let available = $derived(
    !!plan?.availability.available &&
      compatible.some((i) => i.image_id === imageId),
  );
  function choose(p: Plan) {
    selected = p.plan_id;
    imageId =
      images.find(
        (i) =>
          selectableImage(i) &&
          i.compatible_plans.includes(p.plan_id) &&
          i.availability.available,
      )?.image_id ?? "";
    name = "";
    password = "";
    publicKeys = "";
    networkProfile = "lab-dhcp";
    ipv4 = "";
    prefix = 24;
    gateway = "";
    orderId = "";
    productId = "";
    start = false;
    review = false;
    error = "";
    key = crypto.randomUUID();
  }
  async function submit() {
    if (busy || !available || !canOperate || !plan) return;
    busy = true;
    error = "";
    const started = performance.now();
    try {
      const response = await fetch("/api/crm/commands", {
        method: "POST",
        signal: AbortSignal.timeout(45000),
        headers: { "Content-Type": "application/json", "X-CSRF-Token": csrf },
        body: JSON.stringify({
          key,
          action: "create",
          payload: {
            name,
            plan_id: plan.plan_id,
            image_id: imageId,
            network:
              networkProfile === "wan-static"
                ? {
                    profile_id: "wan-static",
                    ipv4_address: ipv4,
                    prefix_length: prefix,
                    gateway,
                  }
                : { profile_id: "lab-dhcp" },
            ...(orderId
              ? {
                  commercial_context: {
                    order_id: orderId,
                    ...(productId ? { product_id: productId } : {}),
                  },
                }
              : {}),
            access: {
              root_password: password,
              ssh_public_keys: publicKeys
                .split("\n")
                .map((s) => s.trim())
                .filter(Boolean),
            },
            start_on_create: start,
          },
        }),
      });
      const result = await response.json();
      if (!response.ok) {
        throw Object.assign(new Error(result.error ?? "REQUEST_FAILED"), {
          diagnostic: result.diagnostic,
        });
      }
      selected = null;
      onaccepted(result);
    } catch (e) {
      const code =
        e instanceof DOMException && e.name === "TimeoutError"
          ? "REQUEST_TIMEOUT"
          : e instanceof Error
            ? e.message
            : "REQUEST_FAILED";
      error = `${connectionMessage(code)}${diagnosticText((e as Error & { diagnostic?: unknown }).diagnostic)} (${code}). Intención ${key}. Consulta Operaciones antes de solicitar otra VM.`;
    } finally {
      lastRequestMs = Math.round(performance.now() - started);
      password = "";
      busy = false;
    }
  }
</script>

{#if plan}
  <section class="panel crm-catalog-section">
    <div class="panel-heading">
      <h2>{review ? "Revisar solicitud" : "Configurar KVM"} · {plan.name}</h2>
    </div>
    <form
      class="form-body"
      onsubmit={(e) => {
        e.preventDefault();
        if (review) void submit();
        else review = true;
      }}
    >
      <p>
        {plan.vcpus} CPU · {plan.memory_mb} MB · {plan.disk_gb} GB. Los recursos proceden
        del producto publicado; no se cambian mediante un perfil histórico.
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
        >Sistema operativo<select
          required
          bind:value={imageId}
          disabled={review || busy}
          >{#each compatible as image}<option value={image.image_id}
              >{image.operating_system} {image.version}</option
            >{/each}</select
        ></label
      >
      <label
        >Red publicada<select
          aria-label="Red publicada"
          bind:value={networkProfile}
          disabled={review || busy}
          ><option value="lab-dhcp">lab-dhcp · DHCP según contrato IACP</option
          >{#if profiles.some((p) => p.profile === "wan-static" && p.self_service_enabled)}<option
              value="wan-static">wan-static · asignación autorizada</option
            >{/if}</select
        ></label
      >
      {#if networkProfile === "wan-static"}<label
          >IPv4 autorizada<input
            required
            bind:value={ipv4}
            disabled={review || busy}
          /></label
        ><label
          >Prefijo IPv4<input
            required
            type="number"
            min="1"
            max="30"
            bind:value={prefix}
            disabled={review || busy}
          /></label
        ><label
          >Gateway autorizado<input
            required
            bind:value={gateway}
            disabled={review || busy}
          /></label
        >{/if}
      <details>
        <summary>Referencias comerciales opcionales de IACP</summary><label
          >Order ID<input
            bind:value={orderId}
            disabled={review || busy}
            maxlength="128"
            pattern="[A-Za-z0-9._:\-]+"
          /></label
        ><label
          >Product ID<input
            bind:value={productId}
            disabled={review || busy}
            maxlength="128"
            pattern="[A-Za-z0-9._:\-]+"
          /></label
        >
        <p class="micro muted">
          Referencias opacas; no acreditan pago ni conceden permisos. No se crea
          una base comercial en este portal.
        </p>
      </details>
      <label
        >Contraseña inicial root<input
          type="password"
          autocomplete="new-password"
          required
          minlength="16"
          maxlength="128"
          bind:value={password}
          disabled={review || busy}
        /><small
          >Entrada segura transitoria para el bootstrap de IACP; no se almacena
          en el journal de este portal.</small
        ></label
      >
      <label
        >Claves públicas SSH (opcionales, una por línea)<textarea
          rows="3"
          bind:value={publicKeys}
          disabled={review || busy}></textarea></label
      >
      <label
        ><input
          type="checkbox"
          bind:checked={start}
          disabled={review || busy}
        /> Solicitar arranque posterior autorizado</label
      >
      {#if !available}<div class="callout warning">
          El producto o la imagen certificada ya no están disponibles. Actualiza
          el catálogo; no se envió una solicitud.
        </div>{/if}
      {#if !canOperate}<div class="callout warning" role="status">
          Reemplaza y valida la única conexión Bearer de IACP. La autorización
          de crear se decide en IACP cuando se envía la solicitud.
          <a class="text-link" href="/administration/connections"
            >Configurar acceso de IACP</a
          >
        </div>{/if}
      {#if review}<div class="callout warning">
          Crear KVM nueva {name}: {plan.name} / {imageId}. Se genera
          infraestructura real; no restaura discos, datos, identidad ni IP.
          Intención {key}.
        </div>{/if}
      {#if error}<div class="callout warning" role="alert">{error}</div>{/if}
      {#if lastRequestMs !== null}<p class="micro muted" role="status">
          Última admisión: {lastRequestMs} ms. Si no hubo respuesta, consulta Operaciones
          antes de volver a enviar.
        </p>{/if}
      <div class="heading-actions">
        <button
          class="button primary"
          disabled={busy || !available || !canOperate}
          >{busy ? "Enviando…" : review ? "Crear KVM" : "Revisar"}</button
        ><button
          type="button"
          class="button"
          disabled={busy}
          onclick={() => {
            if (review) review = false;
            else {
              selected = null;
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
      <h2>Catálogo KVM de IACP</h2>
      <span>CT / LXD no publicado</span>
    </div>
    <div class="product-grid">
      {#each plans as p}<div
          class="product-card panel form-body crm-product-card"
        >
          <h3>{p.name} · KVM</h3>
          <p>{p.vcpus} CPU · {p.memory_mb} MB · {p.disk_gb} GB</p>
          <p>
            Disponibilidad: {p.availability.available
              ? "disponible para solicitar"
              : "no disponible"}. Capacidad física: {p.availability
              .capacity_verified
              ? "verificada por IACP en esta consulta"
              : "no verificada"}.
          </p>
          {#if p.availability.reasons.length}<div class="callout warning">
              {p.availability.reasons.join(" · ")}
            </div>{/if}
          <p>
            Imágenes compatibles: {images
              .filter((i) => i.compatible_plans.includes(p.plan_id))
              .map((i) => `${i.operating_system} ${i.version}`)
              .join(", ") || "ninguna publicada"}
          </p>
          <button
            class="button primary"
            disabled={!canOperate ||
              !p.availability.available ||
              !images.some(
                (i) =>
                  selectableImage(i) && i.compatible_plans.includes(p.plan_id),
              )}
            onclick={() => choose(p)}>Crear KVM</button
          >
          {#if !canOperate}<small class="muted"
              >Requiere conexión IACP validada</small
            >{:else if !p.availability.available}<small class="muted"
              >No disponible según IACP</small
            >{:else if !images.some((i) => selectableImage(i) && i.compatible_plans.includes(p.plan_id))}<small
              class="muted">Sin imagen autorizada compatible</small
            >{/if}
        </div>{:else}<div class="form-body crm-product-card">
          No hay productos publicados cargados.
        </div>{/each}
    </div>
  </section>
  <section class="panel crm-images-section">
    <div class="panel-heading"><h2>Imágenes publicadas</h2></div>
    {#each images as i}<div class="form-body crm-image-item">
        <h3>{i.operating_system} {i.version}</h3>
        <p>
          {i.image_id} · {i.status} · {i.authorized
            ? "autorizada"
            : "sin autorización"} · {i.availability.available
            ? "disponible"
            : "no disponible"}
        </p>
        <p>
          Cloud-Init: {i.cloud_init ?? "desconocido"} · Guest Agent: {i.qemu_guest_agent ??
            "desconocido"} · SSH: {i.ssh_access ?? "desconocido"} · root: {i.root_access ??
            "desconocido"}
        </p>
        <p>{i.availability.reasons.join(" · ")}</p>
      </div>{/each}
  </section>
  <details>
    <summary>Consumo del tenant y perfiles técnicos publicados</summary>
    <section class="panel">
      <div class="form-body">
        {#if usage}
          <p>
            Consumo observado: {Object.entries(usage)
              .map(([r, v]) => `${r}: ${v}`)
              .join(" · ")}. Las cuotas comerciales y la capacidad física son
            controles de IACP; este portal no las calcula ni las impone.
          </p>
        {:else}
          <p>
            El contrato comercial no publica consumo de laboratorio en esta
            consulta. La disponibilidad del producto y la autorización final
            pertenecen a IACP.
          </p>
        {/if}
        {#each profiles as p}<p>
            {p.profile} · {p.image} · {p.network_mode} · nodos {p.nodes.join(
              ", ",
            )}. Parámetros publicados del perfil (informativos): {Object.entries(
              p.quotas,
            )
              .map(([r, v]) => `${r}: ${v}`)
              .join(" · ")}. No sustituyen los derechos comerciales del
            producto.
          </p>{/each}
      </div>
    </section>
  </details>
{/if}
