import { writable } from "svelte/store";
export const notification = writable<string | null>(null);
export const selectedOperation = writable<string | null>(null);
export function notify(message: string) {
  notification.set(message);
}
