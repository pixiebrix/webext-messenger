import { JsonObject } from "type-fest";
import { Method } from "./types.js";

type ErrorObject = {
  name?: string;
  stack?: string;
  message?: string;
  code?: string;
} & JsonObject;

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

export function isErrorObject(error: unknown): error is ErrorObject {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- This is a type guard function and it uses ?.
  return typeof (error as any)?.message === "string";
}

export async function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}
