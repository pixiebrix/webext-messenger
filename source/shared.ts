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

/**
 * Call a function only once, and return the same value for all subsequent calls.
 * @param function_ The function to call once.
 * @param callAgainCallBack A callback that determines if the function should be called again after this one. If it returns
 * `true`, the function will be called again the next time it is called.
 */
export function once<Callback extends (...arguments_: unknown[]) => unknown>(
  function_: Callback,
  { callAgainCallBack }: { callAgainCallBack?: () => boolean} = {}
): Callback {
  let called = false;
  let returnValue: unknown;
  return function (this: unknown, ...arguments_) {
    const callAgain = callAgainCallBack?.();
    if (!called) {
      returnValue = function_.apply(this, arguments_);
      called = !callAgain
    }

    return returnValue;
  } as Callback;
}
