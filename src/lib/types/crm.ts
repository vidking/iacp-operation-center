import { z } from "zod";
const timestamp = z.iso.datetime({ offset: true });
export const profileSchema = z.object({
  profile: z.string(),
  image: z.string(),
  network_mode: z.string(),
  bridge: z.string(),
  vlan_tag: z.number().nullable(),
  nodes: z.array(z.string()),
  minimum_disk_gb: z.number().int(),
  max_vcpus_per_instance: z.number().int(),
  max_memory_mb_per_instance: z.number().int(),
  max_disk_gb_per_instance: z.number().int(),
  self_service_enabled: z.boolean(),
  guest_initialization: z.string().nullable().optional(),
  root_password_bootstrap: z.boolean().default(false),
  quotas: z.record(z.string(), z.number().int()),
});
export const policySchema = z.object({
  policy_id: z.string(),
  tenant_id: z.string(),
  status: z.string(),
  expires_at: timestamp.nullable(),
  revoked_at: timestamp.nullable(),
  specification: z.object({
    profiles: z.array(z.string()),
    actions: z.array(z.string()),
    max_instances: z.number(),
    max_vcpus: z.number(),
    max_memory_mb: z.number(),
    max_disk_gb: z.number(),
    max_concurrent_operations: z.number(),
  }),
});
export const instanceSchema = z.object({
  instance_id: z.string(),
  tenant_id: z.string(),
  operation_id: z.string(),
  job_id: z.string().optional(),
  name: z.string(),
  image: z.string(),
  vcpus: z.number().int(),
  memory_mb: z.number().int(),
  disk_gb: z.number().int(),
  status: z.string(),
  executor: z.enum(["simulated", "provisioning"]).optional(),
  provisioning_service: z.literal("provisioning").optional(),
  infrastructure_kind: z.enum(["kvm", "unprovisioned", "simulated"]),
  vmid: z.number().int().nullable(),
  node: z.string().nullable(),
  access: z
    .object({
      status: z
        .enum(["pending", "verifying", "completed", "failed", "uncertain"])
        .default("pending"),
      cloud_init_complete: z.boolean().nullable().optional(),
      ssh_authenticated: z.boolean().nullable().optional(),
      error_code: z.string().nullable().optional(),
      observed_at: z.string().nullable().optional(),
    })
    .nullable()
    .optional(),
  ip_addresses: z.array(z.string()).default([]),
  network_mode: z.string().default("static"),
  network_observation: z.record(z.string(), z.unknown()).nullable().optional(),
  result: z.record(z.string(), z.unknown()).nullable().optional(),
  network_profile: z.string().nullable().optional(),
  self_service_policy_id: z.string().nullable().optional(),
  created_at: timestamp,
  updated_at: timestamp,
});
export const powerSchema = z.object({
  instance_id: z.string(),
  power_state: z.enum(["running", "stopped"]),
  observed_at: timestamp,
  mutations_available: z.boolean(),
  blocked_reason: z.string().nullable().optional(),
  guest_ready: z.null().optional(),
  guest_agent: z.literal("unknown").optional(),
  cloud_init: z.literal("unknown").optional(),
});
export const usageSchema = z.object({
  tenant_id: z.string(),
  usage: z.record(z.string(), z.number().int()),
  description: z.string(),
});
export const acceptedSchema = z.object({
  instance_id: z.string(),
  operation_id: z.string(),
  status: z.string(),
  job_id: z.string(),
});
export const createInstanceSchema = z
  .object({
    name: z
      .string()
      .min(1)
      .max(63)
      .regex(/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/),
    image: z.string().min(1).max(63),
    network_profile: z.string().min(1).max(63),
    self_service_policy_id: z.uuid(),
    vcpus: z.number().int().min(1).max(64),
    memory_mb: z.number().int().min(512).max(262144).multipleOf(256),
    disk_gb: z.number().int().min(8).max(4096),
    start_on_create: z.boolean().default(false),
    node_preference: z.string().max(128).optional(),
    access: z
      .object({
        username: z.literal("root"),
        password: z.string().min(16).max(128),
      })
      .strict()
      .optional(),
  })
  .strict();
export type Profile = z.infer<typeof profileSchema>;
export type Instance = z.infer<typeof instanceSchema>;
export type Policy = z.infer<typeof policySchema>;
export function activePolicy(
  policy: Policy,
  profile: string,
  action: string,
  now = Date.now(),
) {
  return (
    policy.status === "approved" &&
    !policy.revoked_at &&
    !!policy.expires_at &&
    Date.parse(policy.expires_at) > now &&
    policy.specification.profiles.includes(profile) &&
    policy.specification.actions.includes(action)
  );
}
export const availabilitySchema = z.object({
  available: z.boolean(),
  capacity_verified: z.boolean(),
  reasons: z.array(z.string()),
});
export const planSchema = z.object({
  plan_id: z.string(),
  name: z.string(),
  vcpus: z.number().int(),
  memory_mb: z.number().int(),
  disk_gb: z.number().int(),
  availability: availabilitySchema,
});
export const imageSchema = z.object({
  image_id: z.string(),
  operating_system: z.string(),
  version: z.string(),
  status: z.enum(["pendiente", "certificada", "habilitada", "retirada"]),
  cloud_init: z.boolean().nullable(),
  qemu_guest_agent: z.boolean().nullable(),
  root_access: z.boolean().nullable(),
  ssh_access: z.boolean().nullable(),
  minimum_requirements: z
    .object({ vcpus: z.number(), memory_mb: z.number(), disk_gb: z.number() })
    .nullable(),
  compatible_plans: z.array(z.string()),
  authorized: z.boolean(),
  availability: availabilitySchema,
});
export const commercialCreateSchema = z
  .object({
    name: createInstanceSchema.shape.name,
    plan_id: z.string().min(1).max(63),
    image_id: z.string().min(1).max(63),
    network: z.discriminatedUnion("profile_id", [
      z.object({ profile_id: z.literal("lab-dhcp") }).strict(),
      z
        .object({
          profile_id: z.literal("wan-static"),
          ipv4_address: z.ipv4(),
          prefix_length: z.number().int().min(1).max(30),
          gateway: z.ipv4(),
        })
        .strict(),
    ]),
    access: z
      .object({
        root_password: z
          .string()
          .min(16)
          .max(128)
          .regex(/^[\x20-\x7e]+$/),
        ssh_public_keys: z.array(z.string().max(8192)).max(16).default([]),
      })
      .strict(),
    start_on_create: z.boolean(),
    commercial_context: z
      .object({
        order_id: z
          .string()
          .min(1)
          .max(128)
          .regex(/^[A-Za-z0-9._:-]+$/),
        product_id: z
          .string()
          .min(1)
          .max(128)
          .regex(/^[A-Za-z0-9._:-]+$/)
          .optional(),
      })
      .strict()
      .optional(),
  })
  .strict();
export type Plan = z.infer<typeof planSchema>;
export type GoldenImage = z.infer<typeof imageSchema>;
