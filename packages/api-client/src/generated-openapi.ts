// Generado desde el OpenAPI técnico actual de ControlPlaneV2. CRM/comercial no forma parte de V2.
export interface paths {
  '/health/live': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations['healthLive'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/health/ready': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations['healthReady'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/v1/events': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations['listAuditEvents'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/v1/images': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations['listGoldenImages'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/v1/instances': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations['listInstances'];
    put?: never;
    post: operations['createInstance'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/v1/instances/{instance_id}': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations['getInstance'];
    put?: never;
    post?: never;
    delete: operations['deleteDisposableInstance'];
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/v1/instances/{instance_id}/access/verify': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post: operations['verifyInstanceAccess'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/v1/instances/{instance_id}/network/discover': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post: operations['discoverInstanceNetwork'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/v1/instances/{instance_id}/network/initialize': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post: operations['initializeInstanceNetwork'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/v1/instances/{instance_id}/power': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations['getInstancePower'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/v1/instances/{instance_id}/power/reboot': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post: operations['rebootInstancePower'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/v1/instances/{instance_id}/power/shutdown': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post: operations['shutdownInstancePower'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/v1/instances/{instance_id}/power/start': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post: operations['startInstancePower'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/v1/jobs/{job_id}': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations['getJob'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/v1/jobs/smoke': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post: operations['createSmokeJob'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/v1/observability': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations['getTenantDiagnostics'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/v1/operations': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations['listOperations'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/v1/operations/{operation_id}': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations['getOperation'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/v1/plans': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations['listKVMPlans'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
}
export type webhooks = Record<string, never>;
export interface components {
  schemas: {
    /** Access */
    Access: {
      /**
       * Root Password
       * Format: password
       */
      root_password: string;
      /** Ssh Public Keys */
      ssh_public_keys?: string[];
    };
    /** AccessProgress */
    AccessProgress: {
      /** Cloud Init Complete */
      cloud_init_complete?: boolean | null;
      /** Error Code */
      error_code?: string | null;
      /** Observed At */
      observed_at?: string | null;
      /** Ssh Authenticated */
      ssh_authenticated?: boolean | null;
      /**
       * Status
       * @default pending
       * @enum {string}
       */
      status: 'pending' | 'verifying' | 'completed' | 'failed' | 'uncertain';
      /**
       * Username
       * @default root
       * @constant
       */
      username: 'root';
    };
    /** AuditEnvelope */
    AuditEnvelope: {
      /** Actor */
      actor: string;
      /** Code */
      code: string;
      /** Correlation Id */
      correlation_id: string;
      /** Event Id */
      event_id: number;
      /** Instance Id */
      instance_id: string;
      /** Kind */
      kind: string;
      /**
       * Occurred At
       * Format: date-time
       */
      occurred_at: string;
      /** Operation Id */
      operation_id: string;
      /**
       * Schema Version
       * @default iacp.audit.v1
       * @constant
       */
      schema_version: 'iacp.audit.v1';
      /**
       * Service
       * @enum {string}
       */
      service: 'IaC Worker' | 'Lifecycle Worker' | 'IACP Orchestrator';
      /** Status */
      status: string;
      /** Tenant Id */
      tenant_id: string;
    };
    /** Availability */
    Availability: {
      /** Available */
      available: boolean;
      /** Capacity Verified */
      capacity_verified: boolean;
      /** Reasons */
      reasons: string[];
    };
    /** DeleteRequest */
    DeleteRequest: {
      /** Operation Id */
      operation_id: string;
      /** Plan Sha256 */
      plan_sha256: string;
    };
    /** DeletionAccepted */
    DeletionAccepted: {
      /** Instance Id */
      instance_id: string;
      /** Job Id */
      job_id: string;
      /** Operation Id */
      operation_id: string;
      /**
       * Status
       * @enum {string}
       */
      status: 'queued' | 'running' | 'completed' | 'failed' | 'uncertain';
    };
    /** DeletionProgress */
    DeletionProgress: {
      /** Approved By */
      approved_by: string | null;
      /** Expires At */
      expires_at: string | null;
      /** Finished At */
      finished_at: string | null;
      /** Phase */
      phase: string;
      /** Plan Sha256 */
      plan_sha256: string | null;
      /** Recovery Required */
      recovery_required: boolean;
      /** Started At */
      started_at: string | null;
      /**
       * Status
       * @enum {string}
       */
      status: 'queued' | 'running' | 'planned' | 'approved' | 'uncertain' | 'completed' | 'failed';
    };
    /** DHCPNetwork */
    DHCPNetwork: {
      /**
       * @description discriminator enum property added by openapi-typescript
       * @enum {string}
       */
      profile_id: 'lab-dhcp';
    };
    /** Diagnostics */
    Diagnostics: {
      /** Active Operations */
      active_operations: number;
      /** Dependencies */
      dependencies: {
        [key: string]: string;
      };
      /**
       * Observed At
       * Format: date-time
       */
      observed_at: string;
      /** Oldest Active Age Seconds */
      oldest_active_age_seconds: number;
      /** Queue Depth */
      queue_depth?: {
        [key: string]: number;
      } | null;
      /**
       * Queue Scope
       * @default not-disclosed
       * @constant
       */
      queue_scope: 'not-disclosed';
      /**
       * Schema Version
       * @default iacp.health.v1
       * @constant
       */
      schema_version: 'iacp.health.v1';
      /** Tenant Id */
      tenant_id: string;
      /** Uncertain Operations */
      uncertain_operations: number;
      /**
       * Worker Liveness
       * @default unknown
       * @constant
       */
      worker_liveness: 'unknown';
    };
    /** ErrorResponse */
    ErrorResponse: {
      /** Detail */
      detail: string;
    };
    /** EventPage */
    EventPage: {
      /**
       * Delivery
       * @default replayable-polling
       * @constant
       */
      delivery: 'replayable-polling';
      /** Events */
      events: components['schemas']['AuditEnvelope'][];
      /** Next After */
      next_after: number;
    };
    /** EventResponse */
    EventResponse: {
      /** Actor */
      actor: string;
      /** Code */
      code: string;
      /**
       * Created At
       * Format: date-time
       */
      created_at: string;
      /** Id */
      id: number;
      /**
       * Status
       * @enum {string}
       */
      status: 'queued' | 'running' | 'completed' | 'failed' | 'uncertain';
    };
    /** HealthResponse */
    HealthResponse: {
      /**
       * Status
       * @enum {string}
       */
      status: 'live' | 'ready';
    };
    /** HTTPValidationError */
    HTTPValidationError: {
      /** Detail */
      detail?: components['schemas']['ValidationError'][];
    };
    /** ImageResponse */
    ImageResponse: {
      /** Authorized */
      authorized: boolean;
      availability: components['schemas']['Availability'];
      /** Cloud Init */
      cloud_init: boolean | null;
      /** Compatible Plans */
      compatible_plans: string[];
      /** Image Id */
      image_id: string;
      minimum_requirements: components['schemas']['MinimumRequirements'] | null;
      /** Operating System */
      operating_system: string;
      /** Qemu Guest Agent */
      qemu_guest_agent: boolean | null;
      /** Root Access */
      root_access: boolean | null;
      /** Ssh Access */
      ssh_access: boolean | null;
      /**
       * Status
       * @enum {string}
       */
      status: 'pendiente' | 'certificada' | 'habilitada' | 'retirada';
      /** Version */
      version: string;
    };
    /** InstanceAccepted */
    InstanceAccepted: {
      /**
       * Executor
       * @default simulated
       * @enum {string}
       */
      executor: 'simulated' | 'provisioning';
      /** Instance Id */
      instance_id: string;
      /** Job Id */
      job_id: string;
      /** Operation Id */
      operation_id: string;
      /**
       * Provisioning Service
       * @default provisioning
       * @constant
       */
      provisioning_service: 'provisioning';
      /**
       * Status
       * @default queued
       * @constant
       */
      status: 'queued';
    };
    /** InstanceCreate */
    InstanceCreate: {
      access: components['schemas']['Access'];
      /** Image Id */
      image_id: string;
      /** Name */
      name: string;
      /** Network */
      network?: components['schemas']['DHCPNetwork'] | components['schemas']['StaticNetwork'];
      /**
       * Plan Id
       * @enum {string}
       */
      plan_id: 'kvm-1' | 'kvm-2' | 'kvm-3' | 'kvm-4';
      /**
       * Start On Create
       * @default true
       */
      start_on_create: boolean;
    };
    /** InstanceResponse */
    InstanceResponse: {
      access?: components['schemas']['AccessProgress'] | null;
      /**
       * Created At
       * Format: date-time
       */
      created_at: string;
      /** Disk Gb */
      disk_gb: number;
      /**
       * Executor
       * @enum {string}
       */
      executor: 'simulated' | 'provisioning';
      /** Image */
      image: string;
      /**
       * Infrastructure Kind
       * @enum {string}
       */
      infrastructure_kind: 'simulated' | 'unprovisioned' | 'kvm';
      /** Instance Id */
      instance_id: string;
      /** Ip Addresses */
      ip_addresses?: string[];
      /** Job Id */
      job_id: string;
      /** Memory Mb */
      memory_mb: number;
      /** Name */
      name: string;
      /**
       * Network Mode
       * @default static
       * @enum {string}
       */
      network_mode: 'static' | 'dhcp';
      /** Network Observation */
      network_observation?: {
        [key: string]: unknown;
      } | null;
      /** Network Profile */
      network_profile?: string | null;
      /** Node */
      node: string | null;
      /** Node Preference */
      node_preference?: string | null;
      /** Operation Id */
      operation_id: string;
      /**
       * Provisioning Service
       * @default provisioning
       * @constant
       */
      provisioning_service: 'provisioning';
      /** Result */
      result: {
        [key: string]: unknown;
      } | null;
      /**
       * Start On Create
       * @default false
       */
      start_on_create: boolean;
      /**
       * Status
       * @enum {string}
       */
      status: 'pending' | 'provisioning' | 'ready' | 'failed' | 'deleting' | 'deleted';
      /** Tenant Id */
      tenant_id: string;
      /**
       * Updated At
       * Format: date-time
       */
      updated_at: string;
      /** Vcpus */
      vcpus: number;
      /** Vmid */
      vmid: number | null;
    };
    /** JobAccepted */
    JobAccepted: {
      /** Job Id */
      job_id: string;
      /**
       * Status
       * @default queued
       * @constant
       */
      status: 'queued';
    };
    /** JobResponse */
    JobResponse: {
      /**
       * Created At
       * Format: date-time
       */
      created_at: string;
      /** Job Id */
      job_id: string;
      /** Message */
      message: string;
      /** Operation */
      operation: string;
      /**
       * Status
       * @enum {string}
       */
      status: 'queued' | 'running' | 'completed' | 'failed';
      /**
       * Updated At
       * Format: date-time
       */
      updated_at: string;
    };
    /** MinimumRequirements */
    MinimumRequirements: {
      /** Disk Gb */
      disk_gb: number;
      /** Memory Mb */
      memory_mb: number;
      /** Vcpus */
      vcpus: number;
    };
    /** NetworkAccepted */
    NetworkAccepted: {
      /** Instance Id */
      instance_id: string;
      /** Job Id */
      job_id: string;
      /** Operation Id */
      operation_id: string;
      /**
       * Status
       * @enum {string}
       */
      status: 'queued' | 'running' | 'completed' | 'failed' | 'uncertain';
    };
    /** OperationResponse */
    OperationResponse: {
      /**
       * Created At
       * Format: date-time
       */
      created_at: string;
      deletion?: components['schemas']['DeletionProgress'] | null;
      /** Error Code */
      error_code: string | null;
      /** Error Message */
      error_message?: string | null;
      /** Events */
      events: components['schemas']['EventResponse'][];
      /** Fulfillment */
      fulfillment?: {
        [key: string]: unknown;
      } | null;
      /** Initialization */
      initialization?: {
        [key: string]: unknown;
      } | null;
      /** Instance Id */
      instance_id: string;
      /** Kind */
      kind: string;
      /** Network */
      network?: {
        [key: string]: unknown;
      } | null;
      /**
       * Normalized Status
       * @enum {string}
       */
      normalized_status: 'queued' | 'running' | 'completed' | 'failed' | 'uncertain';
      /** Operation Id */
      operation_id: string;
      power?: components['schemas']['PowerProgress'] | null;
      /** Provisioning */
      provisioning?: {
        [key: string]: unknown;
      } | null;
      /**
       * Recovery Required
       * @default false
       */
      recovery_required: boolean;
      /** Requested By */
      requested_by: string;
      /**
       * Status
       * @enum {string}
       */
      status: 'queued' | 'running' | 'completed' | 'failed' | 'uncertain';
      /**
       * Updated At
       * Format: date-time
       */
      updated_at: string;
    };
    /** PlanResponse */
    PlanResponse: {
      availability: components['schemas']['Availability'];
      /** Disk Gb */
      disk_gb: number;
      /** Memory Mb */
      memory_mb: number;
      /** Name */
      name: string;
      /** Plan Id */
      plan_id: string;
      /** Vcpus */
      vcpus: number;
    };
    /** PowerAccepted */
    PowerAccepted: {
      /** Instance Id */
      instance_id: string;
      /** Job Id */
      job_id: string;
      /** Operation Id */
      operation_id: string;
      /**
       * Status
       * @enum {string}
       */
      status: 'queued' | 'running' | 'completed' | 'failed' | 'uncertain';
    };
    /** PowerProgress */
    PowerProgress: {
      /**
       * Action
       * @enum {string}
       */
      action: 'start' | 'shutdown' | 'reboot';
      /** Finished At */
      finished_at: string | null;
      /** Guest Ready */
      guest_ready?: null;
      /** Phase */
      phase: string;
      /** Power State */
      power_state: ('running' | 'stopped') | null;
      /** Recovery Required */
      recovery_required: boolean;
      /** Started At */
      started_at: string | null;
      /**
       * Status
       * @enum {string}
       */
      status: 'queued' | 'running' | 'completed' | 'failed' | 'uncertain';
      /** Submitted At */
      submitted_at: string | null;
    };
    /** PowerRequest */
    PowerRequest: Record<string, never>;
    /** PowerState */
    PowerState: {
      /**
       * Accessible
       * @default unknown
       * @constant
       */
      accessible: 'unknown';
      /** Blocked Reason */
      blocked_reason?: string | null;
      /**
       * Cloud Init
       * @default unknown
       * @constant
       */
      cloud_init: 'unknown';
      /**
       * Guest Agent
       * @default unknown
       * @constant
       */
      guest_agent: 'unknown';
      /** Guest Ready */
      guest_ready?: null;
      /** Instance Id */
      instance_id: string;
      /** Mutations Available */
      mutations_available: boolean;
      /**
       * Observed At
       * Format: date-time
       */
      observed_at: string;
      /**
       * Os Boot
       * @default unknown
       * @constant
       */
      os_boot: 'unknown';
      /**
       * Power State
       * @enum {string}
       */
      power_state: 'running' | 'stopped';
    };
    /** StaticNetwork */
    StaticNetwork: {
      /** Gateway */
      gateway: string;
      /** Ipv4 Address */
      ipv4_address: string;
      /** Prefix Length */
      prefix_length: number;
      /**
       * @description discriminator enum property added by openapi-typescript
       * @enum {string}
       */
      profile_id: 'wan-static';
    };
    /** ValidationError */
    ValidationError: {
      /** Location */
      loc: (string | number)[];
      /** Message */
      msg: string;
      /** Error Type */
      type: string;
    };
  };
  responses: never;
  parameters: never;
  requestBodies: never;
  headers: never;
  pathItems: never;
}
export type $defs = Record<string, never>;
export interface operations {
  healthLive: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['HealthResponse'];
        };
      };
    };
  };
  healthReady: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['HealthResponse'];
        };
      };
      503: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorResponse'];
        };
      };
    };
  };
  listAuditEvents: {
    parameters: {
      query?: {
        after?: number;
        limit?: number;
      };
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['EventPage'];
        };
      };
      401: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorResponse'];
        };
      };
      403: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorResponse'];
        };
      };
      422: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['HTTPValidationError'];
        };
      };
      503: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorResponse'];
        };
      };
    };
  };
  listGoldenImages: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ImageResponse'][];
        };
      };
      401: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorResponse'];
        };
      };
      403: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorResponse'];
        };
      };
      503: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorResponse'];
        };
      };
    };
  };
  listInstances: {
    parameters: {
      query?: {
        limit?: number;
        name?: string | null;
        network_profile?: string | null;
        node?: string | null;
        offset?: number;
        status?: ('pending' | 'provisioning' | 'ready' | 'failed' | 'deleting' | 'deleted') | null;
      };
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['InstanceResponse'][];
        };
      };
      401: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorResponse'];
        };
      };
      403: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorResponse'];
        };
      };
      422: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['HTTPValidationError'];
        };
      };
      503: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorResponse'];
        };
      };
    };
  };
  createInstance: {
    parameters: {
      query?: never;
      header?: {
        'Idempotency-Key'?: string;
      };
      path?: never;
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['InstanceCreate'];
      };
    };
    responses: {
      202: {
        headers: {
          'Idempotency-Key'?: string;
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['InstanceAccepted'];
        };
      };
      401: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorResponse'];
        };
      };
      403: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorResponse'];
        };
      };
      409: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorResponse'];
        };
      };
      422: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['HTTPValidationError'];
        };
      };
      503: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorResponse'];
        };
      };
    };
  };
  getInstance: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        instance_id: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['InstanceResponse'];
        };
      };
      401: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorResponse'];
        };
      };
      403: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorResponse'];
        };
      };
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorResponse'];
        };
      };
      422: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['HTTPValidationError'];
        };
      };
      503: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorResponse'];
        };
      };
    };
  };
  deleteDisposableInstance: {
    parameters: {
      query?: never;
      header?: {
        'Idempotency-Key'?: string;
      };
      path: {
        instance_id: string;
      };
      cookie?: never;
    };
    requestBody?: {
      content: {
        'application/json':
          components['schemas']['DeleteRequest'] | components['schemas']['PowerRequest'] | null;
      };
    };
    responses: {
      202: {
        headers: {
          'Idempotency-Key'?: string;
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DeletionAccepted'];
        };
      };
      401: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorResponse'];
        };
      };
      403: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorResponse'];
        };
      };
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorResponse'];
        };
      };
      409: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorResponse'];
        };
      };
      422: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['HTTPValidationError'];
        };
      };
      503: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorResponse'];
        };
      };
    };
  };
  verifyInstanceAccess: {
    parameters: {
      query?: never;
      header: {
        'Idempotency-Key': string;
      };
      path: {
        instance_id: string;
      };
      cookie?: never;
    };
    requestBody?: {
      content: {
        'application/json': components['schemas']['PowerRequest'] | null;
      };
    };
    responses: {
      202: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['NetworkAccepted'];
        };
      };
      401: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorResponse'];
        };
      };
      403: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorResponse'];
        };
      };
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorResponse'];
        };
      };
      409: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorResponse'];
        };
      };
      422: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['HTTPValidationError'];
        };
      };
      503: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorResponse'];
        };
      };
    };
  };
  discoverInstanceNetwork: {
    parameters: {
      query?: never;
      header: {
        'Idempotency-Key': string;
      };
      path: {
        instance_id: string;
      };
      cookie?: never;
    };
    requestBody?: {
      content: {
        'application/json': components['schemas']['PowerRequest'] | null;
      };
    };
    responses: {
      202: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['NetworkAccepted'];
        };
      };
      401: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorResponse'];
        };
      };
      403: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorResponse'];
        };
      };
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorResponse'];
        };
      };
      409: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorResponse'];
        };
      };
      422: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['HTTPValidationError'];
        };
      };
      503: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorResponse'];
        };
      };
    };
  };
  initializeInstanceNetwork: {
    parameters: {
      query?: never;
      header: {
        'Idempotency-Key': string;
      };
      path: {
        instance_id: string;
      };
      cookie?: never;
    };
    requestBody?: {
      content: {
        'application/json': components['schemas']['PowerRequest'] | null;
      };
    };
    responses: {
      202: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['NetworkAccepted'];
        };
      };
      401: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorResponse'];
        };
      };
      403: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorResponse'];
        };
      };
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorResponse'];
        };
      };
      409: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorResponse'];
        };
      };
      422: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['HTTPValidationError'];
        };
      };
      503: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorResponse'];
        };
      };
    };
  };
  getInstancePower: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        instance_id: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['PowerState'];
        };
      };
      401: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorResponse'];
        };
      };
      403: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorResponse'];
        };
      };
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorResponse'];
        };
      };
      409: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorResponse'];
        };
      };
      422: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['HTTPValidationError'];
        };
      };
      503: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorResponse'];
        };
      };
    };
  };
  rebootInstancePower: {
    parameters: {
      query?: never;
      header?: {
        'Idempotency-Key'?: string;
      };
      path: {
        instance_id: string;
      };
      cookie?: never;
    };
    requestBody?: {
      content: {
        'application/json': components['schemas']['PowerRequest'] | null;
      };
    };
    responses: {
      202: {
        headers: {
          'Idempotency-Key'?: string;
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['PowerAccepted'];
        };
      };
      401: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorResponse'];
        };
      };
      403: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorResponse'];
        };
      };
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorResponse'];
        };
      };
      409: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorResponse'];
        };
      };
      422: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['HTTPValidationError'];
        };
      };
      503: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorResponse'];
        };
      };
    };
  };
  shutdownInstancePower: {
    parameters: {
      query?: never;
      header?: {
        'Idempotency-Key'?: string;
      };
      path: {
        instance_id: string;
      };
      cookie?: never;
    };
    requestBody?: {
      content: {
        'application/json': components['schemas']['PowerRequest'] | null;
      };
    };
    responses: {
      202: {
        headers: {
          'Idempotency-Key'?: string;
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['PowerAccepted'];
        };
      };
      401: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorResponse'];
        };
      };
      403: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorResponse'];
        };
      };
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorResponse'];
        };
      };
      409: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorResponse'];
        };
      };
      422: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['HTTPValidationError'];
        };
      };
      503: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorResponse'];
        };
      };
    };
  };
  startInstancePower: {
    parameters: {
      query?: never;
      header?: {
        'Idempotency-Key'?: string;
      };
      path: {
        instance_id: string;
      };
      cookie?: never;
    };
    requestBody?: {
      content: {
        'application/json': components['schemas']['PowerRequest'] | null;
      };
    };
    responses: {
      202: {
        headers: {
          'Idempotency-Key'?: string;
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['PowerAccepted'];
        };
      };
      401: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorResponse'];
        };
      };
      403: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorResponse'];
        };
      };
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorResponse'];
        };
      };
      409: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorResponse'];
        };
      };
      422: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['HTTPValidationError'];
        };
      };
      503: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorResponse'];
        };
      };
    };
  };
  getJob: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        job_id: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['JobResponse'];
        };
      };
      401: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorResponse'];
        };
      };
      403: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorResponse'];
        };
      };
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorResponse'];
        };
      };
      422: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['HTTPValidationError'];
        };
      };
      503: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorResponse'];
        };
      };
    };
  };
  createSmokeJob: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      202: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['JobAccepted'];
        };
      };
      401: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorResponse'];
        };
      };
      403: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorResponse'];
        };
      };
      503: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorResponse'];
        };
      };
    };
  };
  getTenantDiagnostics: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Diagnostics'];
        };
      };
      401: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorResponse'];
        };
      };
      403: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorResponse'];
        };
      };
      503: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorResponse'];
        };
      };
    };
  };
  listOperations: {
    parameters: {
      query?: {
        instance_id?: string | null;
        limit?: number;
        offset?: number;
        status?: string | null;
      };
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['OperationResponse'][];
        };
      };
      401: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorResponse'];
        };
      };
      403: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorResponse'];
        };
      };
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorResponse'];
        };
      };
      422: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['HTTPValidationError'];
        };
      };
      503: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorResponse'];
        };
      };
    };
  };
  getOperation: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        operation_id: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['OperationResponse'];
        };
      };
      401: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorResponse'];
        };
      };
      403: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorResponse'];
        };
      };
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorResponse'];
        };
      };
      422: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['HTTPValidationError'];
        };
      };
      503: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorResponse'];
        };
      };
    };
  };
  listKVMPlans: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['PlanResponse'][];
        };
      };
      401: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorResponse'];
        };
      };
      403: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorResponse'];
        };
      };
      503: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorResponse'];
        };
      };
    };
  };
}
