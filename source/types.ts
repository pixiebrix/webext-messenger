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
  ? (target: Target | PageTarget, ...args: PreviousArguments) => TReturnValue
  : never;

/* OmitThisParameter doesn't seem to do anything on pixiebrix-extensionâ€¦ */
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
  trace: Sender[];
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
  trace?: Sender[];
}

export type Message<LocalArguments extends Arguments = Arguments> = {
  type: keyof MessengerMethods;
  args: LocalArguments;
  target: Target | PageTarget;

  /** If the message is being sent to an intermediary receiver, also set the options */
  options?: Options;
};

export type Sender = Runtime.MessageSender;

export type MessengerMessage = Message & {
  /** Guarantees that a message is meant to be handled by this library */
  __webextMessenger: true;
};

export interface AnyTarget {
  tabId?: number | "this";
  frameId?: number;
  page?: string;
}

export interface Target {
  tabId: number;
  frameId?: number;
}

export interface PageTarget {
  tabId?: number | "this";
  page: string;
}
