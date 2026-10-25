import type { DemoWorker, DemoIncident } from "../types/portal";
export const snapshot = "2026-10-25T08:00:00Z";
export const volume = [
  12, 18, 15, 27, 24, 36, 28, 42, 33, 31, 45, 39, 57, 46, 52, 61, 49, 65, 58,
  72, 60, 67, 78, 64,
];
export const hourlyLabels = [
  "09:00",
  "12:00",
  "15:00",
  "18:00",
  "21:00",
  "00:00",
  "03:00",
  "06:00",
];
export const workers: DemoWorker[] = [
  {
    id: "w-01",
    name: "provisioning-01",
    service: "IaC Worker",
    status: "running",
    task: "instance.create",
    duration: 142,
    utilization: 64,
    history: [20, 30, 25, 45, 40, 60, 48, 64],
  },
  {
    id: "w-02",
    name: "provisioning-02",
    service: "IaC Worker",
    status: "running",
    task: "instance.create",
    duration: 86,
    utilization: 42,
    history: [15, 25, 35, 28, 38, 32, 44, 42],
  },
  {
    id: "w-03",
    name: "lifecycle-01",
    service: "Lifecycle Worker",
    status: "idle",
    task: "Sin tarea de ejemplo",
    duration: 0,
    utilization: 8,
    history: [40, 25, 20, 15, 12, 8, 5, 8],
  },
  {
    id: "w-04",
    name: "lifecycle-02",
    service: "Lifecycle Worker",
    status: "offline",
    task: "Sin actividad de ejemplo",
    duration: 0,
    utilization: 0,
    history: [25, 22, 20, 0, 0, 0, 0, 0],
  },
];
export const queues = [
  { name: "provisioning", waiting: 3, processing: 2, capacity: 10 },
  { name: "lifecycle", waiting: 0, processing: 0, capacity: 6 },
  { name: "network", waiting: 1, processing: 1, capacity: 6 },
];
export const incidents: DemoIncident[] = [
  {
    id: "INC-DEMO-001",
    title: "Resultado de aprovisionamiento incierto",
    operationId: "demo-op-003",
    severity: "high",
    state: "open",
    time: "07:58 UTC",
    description:
      "El estado persistido indica failed, pero normalized_status es uncertain. La evidencia no permite confirmar el resultado de la intención.",
    recommendation:
      "Revisar el historial correlacionado sobre el mismo operation_id y contrastar la evidencia disponible en Control Plane. No duplicar la intención.",
  },
  {
    id: "INC-DEMO-002",
    title: "Planificación finalizada con error",
    operationId: "demo-op-006",
    severity: "medium",
    state: "open",
    time: "07:46 UTC",
    description:
      "La muestra contiene un error PROVISIONING_FAILED. El código por sí solo no identifica una causa raíz.",
    recommendation:
      "Inspeccionar códigos y eventos de la operación. La revisión técnica y cualquier continuación corresponden al Control Plane.",
  },
  {
    id: "INC-DEMO-003",
    title: "Observación de red completada",
    operationId: "demo-op-005",
    severity: "low",
    state: "resolved",
    time: "Ayer · 18:42",
    description:
      "Registro histórico ficticio para explorar la vista de incidentes resueltos.",
    recommendation:
      "Conservar evidencia y correlación para una revisión posterior.",
  },
];
export const clients = [
  {
    id: "CUS-DEMO-01",
    name: "Aurora Labs",
    initials: "AL",
    email: "infra@aurora.example",
    instances: 4,
  },
  {
    id: "CUS-DEMO-02",
    name: "Nébula Studio",
    initials: "NS",
    email: "ops@nebula.example",
    instances: 2,
  },
  {
    id: "CUS-DEMO-03",
    name: "Atlas Research",
    initials: "AR",
    email: "cloud@atlas.example",
    instances: 3,
  },
];
export const products = [
  {
    id: "sandbox",
    name: "KVM Sandbox",
    cpu: 2,
    ram: 4,
    disk: 40,
    description: "Desarrollo y pruebas",
    color: "violet",
  },
  {
    id: "standard",
    name: "KVM Standard",
    cpu: 4,
    ram: 8,
    disk: 80,
    description: "Aplicaciones de equipo",
    color: "orange",
  },
  {
    id: "performance",
    name: "KVM Performance",
    cpu: 8,
    ram: 16,
    disk: 160,
    description: "Cargas de ejemplo intensivas",
    color: "cyan",
  },
];
export const orders = [
  {
    id: "ORD-DEMO-1042",
    client: "Aurora Labs",
    product: "KVM Standard",
    status: "running",
    operation: "demo-op-001",
  },
  {
    id: "ORD-DEMO-1041",
    client: "Nébula Studio",
    product: "KVM Sandbox",
    status: "completed",
    operation: "demo-op-002",
  },
  {
    id: "ORD-DEMO-1040",
    client: "Atlas Research",
    product: "KVM Performance",
    status: "uncertain",
    operation: "demo-op-003",
  },
];
