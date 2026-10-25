import { writable } from "svelte/store";
import type { ViewState } from "../types/portal";
export const viewState = writable<ViewState>("ready");
export const notification = writable<string | null>(null);
export const selectedOperation = writable<string | null>(null);
export function notify(message: string) {
  notification.set(message);
}
