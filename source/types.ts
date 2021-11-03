import { Runtime } from "webextension-polyfill";
import { Asyncify, ValueOf } from "type-fest";
import { ErrorObject } from "serialize-error";

// The global interface is used to declare the types of the methods.
// This "empty" declaration helps the local code understand what
// `MessengerMethods[string]` may look like. Do not use `Record<string, Method>`
// because an index signature would allow any string to return Method and
// it would make `getMethod` too loose.
declare global {
  interface MessengerMethods {
    _: Method;
  }
}

type WithTarget<Method> = Method extends (
  ...args: infer PreviousArguments
) => infer TReturnValue
  ? (target: Target, ...args: PreviousArguments) => TReturnValue
  : never;

/* OmitThisParameter doesn't seem to do anything on pixiebrix-extension… */
type ActuallyOmitThisParameter<T> = T extends (...args: infer A) => infer R
  ? (...args: A) => R
  : T;

/** Removes the `this` type and ensure it's always Promised */
export type PublicMethod<Method extends ValueOf<MessengerMethods>> = Asyncify<
  ActuallyOmitThisParameter<Method>
>;

export type PublicMethodWithTarget<Method extends ValueOf<MessengerMethods>> =
  WithTarget<PublicMethod<Method>>;

export interface MessengerMeta {
  trace: Runtime.MessageSender[];
}

type RawMessengerResponse =
  | {
      value: unknown;
    }
  | {
      error: ErrorObject;
    };

export type MessengerResponse = RawMessengerResponse & {
  /** Guarantees that the message was handled by this library */
  __webextMessenger: true;
};

type Arguments = any[];
export type Method = (
  this: MessengerMeta,
  ...args: Arguments
) => Promise<unknown>;

export interface Options {
  /**
   * "Notifications" won't await the response, return values, attempt retries, nor throw errors
   * @default false
   */
  isNotification?: boolean;
}

export type Message<LocalArguments extends Arguments = Arguments> = {
  type: keyof MessengerMethods;
  args: LocalArguments;

  /** If the message is being sent to an intermediary receiver, also set the target */
  target?: Target;

  /** If the message is being sent to an intermediary receiver, also set the options */
  options?: Target;
};

export type MessengerMessage = Message & {
  /** Guarantees that a message is meant to be handled by this library */
  __webextMessenger: true;
};

export interface Target {
  tabId: number;
  frameId?: number;
}

export interface UrlTarget {
  tabId?: number;
  url: string;
}
