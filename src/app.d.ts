import type { Principal } from "./lib/types/security";
declare global {
  namespace App {
    interface Locals {
      user?: Principal;
      csrf?: string;
      body?: Record<string, unknown>;
    }
  }
}
export {};
