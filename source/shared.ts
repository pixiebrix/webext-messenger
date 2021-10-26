import { Method } from "./types.js";

export const __webextMessenger = true;
export function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export class MessengerError extends Error {
  override name = "MessengerError";
}

export const handlers = new Map<string, Method>();

// .bind preserves the call location in the console
export const debug = console.debug.bind(console, "Messenger:");
export const warn = console.warn.bind(console, "Messenger:");
