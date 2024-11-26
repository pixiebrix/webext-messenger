import { type JsonObject } from "type-fest";
import { errorConstructors } from "serialize-error";

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

// @ts-expect-error Wrong `errorConstructors` types
errorConstructors.set("MessengerError", MessengerError);

export function isErrorObject(error: unknown): error is ErrorObject {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- This is a type guard function and it uses ?.
  return typeof (error as any)?.message === "string";
}

export async function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

export function once<Callback extends (...arguments_: unknown[]) => unknown>(
  function_: Callback,
): Callback {
  let called = false;
  let returnValue: unknown;
  return function (this: unknown, ...arguments_) {
    if (!called) {
      returnValue = function_.apply(this, arguments_);
      called = true;
    }

    return returnValue;
  } as Callback;
}
