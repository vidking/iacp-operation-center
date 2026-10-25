<script lang="ts">
  import {
    Users,
    ShoppingBag,
    Server,
    ArrowUpRight,
    Plus,
    Cpu,
    MemoryStick,
    HardDrive,
    Check,
    ShoppingCart,
  } from "@lucide/svelte";
  import { clients, products, orders } from "#lib/mocks/experience.ts";
  import StatCard from "../ui/StatCard.svelte";
  import Badge from "../ui/Badge.svelte";
  import { notify, selectedOperation } from "#lib/stores/portal.ts";
  let tab = $state("dashboard");
  let product = $state("standard");
  let customer = $state(clients[0].id);
  let name = $state("");
  let environment = $state("sandbox");
  let preview = $state(false);
  let selected = $derived(products.find((p) => p.id === product)!);
  let client = $derived(clients.find((c) => c.id === customer)!);
  function submit(event: SubmitEvent) {
    event.preventDefault();
    preview = true;
    notify("Vista previa DEMO preparada. No se creó ni envió ningún pedido.");
  }
</script>

<div class="crm-notice">
  <span class="icon-tile violet"><ShoppingBag size={20} /></span>
  <div>
    <strong
      >CRM Simulator <span class="demo-tag">MAQUETA INTERACTIVA</span></strong
    >
    <p>
      Clientes, catálogo y pedidos ficticios. La implementación comercial se
      integrará desde <code>iacp-crm-simulator</code>.
    </p>
  </div>
</div>
<div class="filter-tabs">
  {#each [{ id: "dashboard", label: "Dashboard" }, { id: "clients", label: "Clientes" }, { id: "catalog", label: "Catálogo KVM" }, { id: "request", label: "Solicitud DEMO" }, { id: "orders", label: "Pedidos" }] as item}<button
      class:chosen={tab === item.id}
      onclick={() => (tab = item.id)}>{item.label}</button
    >{/each}
</div>
{#if tab === "dashboard"}<div class="stat-grid crm-stats">
    <StatCard
      label="Clientes ficticios"
      value={clients.length}
      detail="Identidades de demostración"
      tone="violet">{#snippet icon()}<Users size={18} />{/snippet}</StatCard
    ><StatCard
      label="Productos KVM"
      value={products.length}
      detail="Catálogo visual de ejemplo"
      tone="orange">{#snippet icon()}<Server size={18} />{/snippet}</StatCard
    ><StatCard
      label="Pedidos de muestra"
      value={orders.length}
      detail="Fixtures · sin transacciones reales"
      tone="green"
      >{#snippet icon()}<ShoppingCart size={18} />{/snippet}</StatCard
    >
  </div>
  <section class="crm-welcome panel">
    <div>
      <span class="eyebrow">DEL CLIENTE A LA INFRAESTRUCTURA</span>
      <h2>Explora la experiencia comercial.</h2>
      <p>
        Revisa el catálogo, selecciona un cliente ficticio y prepara una vista
        previa. Ninguna solicitud sale de este navegador.
      </p>
      <button
        class="button primary"
        onclick={() => {
          tab = "request";
          preview = false;
        }}><Plus size={16} /> Preparar solicitud DEMO</button
      >
    </div>
    <div class="crm-flow">
      <span><Users size={25} /> Cliente</span><i>→</i><span
        ><ShoppingBag size={25} /> Pedido</span
      ><i>→</i><span><Server size={25} /> KVM</span>
    </div>
  </section>{/if}
{#if tab === "clients"}<section class="panel">
    <div class="panel-heading">
      <h2>Clientes ficticios</h2>
      <span class="demo-tag">DEMO</span>
    </div>
    <div class="table-wrap">
      <table>
        <thead
          ><tr
            ><th>Cliente</th><th>Identificador</th><th>Contacto ficticio</th><th
              >Instancias de ejemplo</th
            ><th></th></tr
          ></thead
        ><tbody
          >{#each clients as c}<tr
              ><td
                ><div class="client-cell">
                  <span class="avatar violet">{c.initials}</span><strong
                    >{c.name}</strong
                  >
                </div></td
              ><td class="mono">{c.id}</td><td>{c.email}</td><td
                >{c.instances}</td
              ><td
                ><button
                  class="text-link"
                  onclick={() => {
                    customer = c.id;
                    tab = "request";
                    preview = false;
                  }}>Preparar demo <ArrowUpRight size={13} /></button
                ></td
              ></tr
            >{/each}</tbody
        >
      </table>
    </div>
  </section>{/if}
{#if tab === "catalog" || tab === "dashboard"}<div class="section-line">
    <h2>Catálogo de productos KVM</h2>
    <span class="demo-tag">ESPECIFICACIONES FICTICIAS</span>
  </div>
  <div class="product-grid">
    {#each products as p}<article class="panel product-card {p.color}">
        <span class="icon-tile {p.color}"><Server size={23} /></span>
        <h3>{p.name}</h3>
        <p>{p.description}</p>
        <ul>
          <li><Cpu size={15} /><strong>{p.cpu}</strong> vCPU</li>
          <li><MemoryStick size={15} /><strong>{p.ram} GB</strong> memoria</li>
          <li>
            <HardDrive size={15} /><strong>{p.disk} GB</strong> almacenamiento
          </li>
        </ul>
        <button
          class="button w-full"
          onclick={() => {
            product = p.id;
            tab = "request";
            preview = false;
          }}>Seleccionar producto <ArrowUpRight size={14} /></button
        >
      </article>{/each}
  </div>{/if}
{#if tab === "request"}<div class="request-layout">
    <form class="panel request-form" onsubmit={submit}>
      <div class="panel-heading">
        <div>
          <h2>Solicitud de VM</h2>
          <p>Solo vista previa local · no es una intención técnica</p>
        </div>
        <span class="demo-tag">DEMO</span>
      </div>
      <div class="form-body">
        <label
          >Cliente ficticio<select
            bind:value={customer}
            onchange={() => (preview = false)}
            >{#each clients as c}<option value={c.id}>{c.name}</option
              >{/each}</select
          ></label
        ><label
          >Nombre de la instancia<input
            required
            minlength="3"
            maxlength="40"
            pattern="[a-zA-Z0-9-]+"
            placeholder="ej. aurora-dev-01"
            bind:value={name}
            oninput={() => (preview = false)}
          /><small
            >Entre 3 y 40 letras, números o guiones. Sin datos sensibles.</small
          ></label
        ><label
          >Producto KVM<select
            bind:value={product}
            onchange={() => (preview = false)}
            >{#each products as p}<option value={p.id}
                >{p.name} · {p.cpu} vCPU / {p.ram} GB RAM</option
              >{/each}</select
          ></label
        ><label
          >Entorno de muestra<select
            bind:value={environment}
            onchange={() => (preview = false)}
            ><option value="sandbox">Sandbox de demostración</option><option
              value="development">Desarrollo ficticio</option
            ></select
          ></label
        >
        <div class="callout">
          <ShoppingBag size={18} />
          <p>
            No se guardan pedidos, no se calculan cuotas ni se ejecuta
            aprovisionamiento.
          </p>
        </div>
        <button class="button primary w-full" type="submit"
          ><Check size={16} /> Preparar vista previa DEMO</button
        >
      </div>
    </form>
    <section class="panel request-summary">
      <span class="eyebrow">RESUMEN DE EJEMPLO</span>
      <h2>{selected.name}</h2>
      <div class="detail-grid">
        <div>
          <dt>CPU</dt>
          <dd>{selected.cpu} vCPU</dd>
        </div>
        <div>
          <dt>Memoria</dt>
          <dd>{selected.ram} GB</dd>
        </div>
        <div>
          <dt>Disco</dt>
          <dd>{selected.disk} GB</dd>
        </div>
        <div>
          <dt>Cliente</dt>
          <dd>{client.name}</dd>
        </div>
      </div>
      {#if preview}<div class="preview-success" role="status">
          <Check size={21} /><strong>Vista previa preparada</strong>
          <p>{name} · {environment}</p>
          <small>No enviada · sin persistencia · sin operación IACP</small>
        </div>{:else}<p class="muted">
          Completa el formulario para explorar la confirmación visual.
        </p>{/if}
    </section>
  </div>{/if}
{#if tab === "orders" || tab === "dashboard"}<section class="panel">
    <div class="panel-heading">
      <div>
        <h2>Historial de pedidos ficticios</h2>
        <p>Estados de aprovisionamiento tomados de la muestra DEMO</p>
      </div>
      <span class="demo-tag">DEMO</span>
    </div>
    <div class="table-wrap">
      <table>
        <thead
          ><tr
            ><th>Pedido</th><th>Cliente</th><th>Producto</th><th
              >Aprovisionamiento</th
            ><th>Correlación</th></tr
          ></thead
        ><tbody
          >{#each orders as order}<tr
              ><td class="mono">{order.id}</td><td>{order.client}</td><td
                >{order.product}</td
              ><td><Badge value={order.status} /></td><td
                ><button
                  class="operation-link mono"
                  onclick={() => selectedOperation.set(order.operation)}
                  >{order.operation}<ArrowUpRight size={12} /></button
                ></td
              ></tr
            >{/each}</tbody
        >
      </table>
    </div>
  </section>{/if}
