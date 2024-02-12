import { type Runtime } from "webextension-polyfill";
import { type Asyncify, type ValueOf } from "type-fest";
import { type ErrorObject } from "serialize-error";

/**
 * @file Target types are a bit overlapping. That's because some are "request" targets
 * and some are "known" targets. The difference is that you could "request" `{tabId: 1}`, but you "know" that a specific target is exactly `{tabId: 1, frameId: 5}`
 * TODO: Cleanup, clarify, deduplicate Target types
 */

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

type Arguments = unknown[];
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
  retry?: boolean;

  /** Automatically generated internally */
  seq?: number;
}

export type Message<LocalArguments extends Arguments = Arguments> = {
  type: keyof MessengerMethods;
  args: LocalArguments;
  target: Target | PageTarget;

  /** If the message is being sent to an intermediary receiver, also set the options */
  options?: Options;
};

export type Sender = Runtime.MessageSender & { origin?: string }; // Chrome includes the origin

export type MessengerMessage = Message & {
  /** Guarantees that a message is meant to be handled by this library */
  __webextMessenger: true;
};

export interface AnyTarget {
  tabId?: number | "this";
  frameId?: number | "allFrames";
  page?: string;
}

export interface TopLevelFrame {
  tabId: number;
  frameId: 0;
}

export interface FrameTarget {
  tabId: number;
  frameId: number;
}

export interface KnownTarget {
  tabId?: number;
  frameId?: number;
  page: string;
}

export interface Target {
  tabId: number;
  frameId?: number | "allFrames";
}

export interface PageTarget {
  tabId?: number | "this";
  page: string;
}
