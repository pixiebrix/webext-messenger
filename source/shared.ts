import { Method } from "./types";

// eslint-disable-next-line @typescript-eslint/naming-convention -- Private key
export const __webext_messenger__ = true;
export function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export class MessengerError extends Error {
  override name = "MessengerError";
}

export const handlers = new Map<string, Method>();
