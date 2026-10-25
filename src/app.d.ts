declare global {
  namespace App {
    interface Locals {
      observer?: { subject: string; role: "reader"; tenantId: string };
    }
  }
}
export {};
