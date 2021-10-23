import pRetry from "p-retry";
import { deserializeError, ErrorObject, serializeError } from "serialize-error";
import { Asyncify, SetReturnType, ValueOf } from "type-fest";
import { isBackgroundPage } from "webext-detect-page";

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
type PublicMethod<Method extends ValueOf<MessengerMethods>> = Asyncify<
  ActuallyOmitThisParameter<Method>
>;

type PublicMethodWithTarget<Method extends ValueOf<MessengerMethods>> =
  WithTarget<PublicMethod<Method>>;

export interface MessengerMeta {
  trace: browser.runtime.MessageSender[];
}

type RawMessengerResponse =
  | {
      value: unknown;
    }
  | {
      error: ErrorObject;
    };

type MessengerResponse = RawMessengerResponse & {
  /** Guarantees that the message was handled by this library */
  __webext_messenger__: true;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Unused, in practice
type Arguments = any[];
type Method = (this: MessengerMeta, ...args: Arguments) => Promise<unknown>;

type Message<LocalArguments extends Arguments = Arguments> = {
  type: keyof MessengerMethods;
  args: LocalArguments;

  /** If the message is being sent to an intermediary receiver, also set the target */
  target?: Target;

  /** If the message is being sent to an intermediary receiver, also set the options */
  options?: Target;
};

type MessengerMessage = Message & {
  /** Guarantees that a message is meant to be handled by this library */
  __webext_messenger__: true;
};

export class MessengerError extends Error {
  override name = "MessengerError";
}

// eslint-disable-next-line @typescript-eslint/naming-convention -- Private key
const __webext_messenger__ = true;
function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isMessengerMessage(message: unknown): message is Message {
  return (
    isObject(message) &&
    typeof message["type"] === "string" &&
    message["__webext_messenger__"] === true &&
    Array.isArray(message["args"])
  );
}

function isMessengerResponse(response: unknown): response is MessengerResponse {
  return isObject(response) && response["__webext_messenger__"] === true;
}

const handlers = new Map<string, Method>();

async function handleCall(
  message: Message,
  sender: MessengerMeta,
  call: Promise<unknown> | unknown
): Promise<MessengerResponse> {
  console.debug(`Messenger:`, message.type, message.args, "from", { sender });
  // The handler could actually be a synchronous function
  const response = await Promise.resolve(call).then(
    (value) => ({ value }),
    (error: unknown) => ({
      // Errors must be serialized because the stacktraces are currently lost on Chrome and
      // https://github.com/mozilla/webextension-polyfill/issues/210
      error: serializeError(error),
    })
  );

  console.debug(`Messenger:`, message.type, "responds", response);
  // eslint-disable-next-line @typescript-eslint/naming-convention -- Private key
  return { ...response, __webext_messenger__ };
}

async function handleMessage(
  message: Message,
  sender: MessengerMeta
): Promise<MessengerResponse | void> {
  if (message.target) {
    const publicMethod = getContentScriptMethod(message.type);
    return handleCall(
      message,
      sender,
      publicMethod(message.target, ...message.args)
    );
  }

  const handler = handlers.get(message.type);
  if (handler) {
    return handleCall(message, sender, handler.apply(sender, message.args));
  }

  // More context in https://github.com/pixiebrix/webext-messenger/issues/45
  console.warn(
    "Messenger:",
    message.type,
    "received but ignored; No handlers were registered here"
  );
}

// Do not turn this into an `async` function; Notifications must turn `void`
function manageConnection(
  type: string,
  options: Options,
  sendMessage: () => Promise<unknown>
): Promise<unknown> | void {
  if (!options.isNotification) {
    return manageMessage(type, sendMessage);
  }

  void sendMessage().catch((error: unknown) => {
    console.debug("Messenger:", type, "notification failed", { error });
  });
}

async function manageMessage(
  type: string,
  sendMessage: () => Promise<MessengerResponse | unknown>
): Promise<unknown> {
  const response = await pRetry(sendMessage, {
    minTimeout: 100,
    factor: 1.3,
    maxRetryTime: 4000,
    onFailedAttempt(error) {
      if (
        error?.message !==
        "Could not establish connection. Receiving end does not exist."
      ) {
        throw error;
      }

      console.debug("Messenger:", type, "will retry");
    },
  });

  if (!isMessengerResponse(response)) {
    throw new MessengerError(
      `No handler for ${type} was registered in the receiving end`
    );
  }

  if ("error" in response) {
    throw deserializeError(response.error);
  }

  return response.value;
}

// MUST NOT be `async` or Promise-returning-only
function onMessageListener(
  message: unknown,
  sender: browser.runtime.MessageSender
): Promise<unknown> | void {
  if (isMessengerMessage(message)) {
    return handleMessage(message, { trace: [sender] });
  }

  // TODO: Add test for this eventuality: ignore unrelated messages
}

export interface Target {
  tabId: number;
  frameId?: number;
}

interface Options {
  /**
   * "Notifications" won't await the response, return values, attempt retries, nor throw errors
   * @default false
   */
  isNotification?: boolean;
}

function makeMessage(
  type: keyof MessengerMethods,
  args: unknown[],
  target?: Target
): MessengerMessage {
  return {
    // eslint-disable-next-line @typescript-eslint/naming-convention -- Private key
    __webext_messenger__,
    type,
    args,
    target,
  };
}

/**
 * Replicates the original method, including its types.
 * To be called in the sender’s end.
 */
function getContentScriptMethod<
  Type extends keyof MessengerMethods,
  Method extends MessengerMethods[Type],
  PublicMethod extends PublicMethodWithTarget<Method>
>(
  type: Type,
  options: { isNotification: true }
): SetReturnType<PublicMethod, void>;
function getContentScriptMethod<
  Type extends keyof MessengerMethods,
  Method extends MessengerMethods[Type],
  PublicMethod extends PublicMethodWithTarget<Method>
>(type: Type, options?: Options): PublicMethod;
function getContentScriptMethod<
  Type extends keyof MessengerMethods,
  Method extends MessengerMethods[Type],
  PublicMethod extends PublicMethodWithTarget<Method>
>(type: Type, options: Options = {}): PublicMethod {
  const publicMethod = (target: Target, ...args: Parameters<Method>) => {
    // eslint-disable-next-line no-negated-condition -- Looks better
    const sendMessage = !browser.tabs
      ? async () => browser.runtime.sendMessage(makeMessage(type, args, target))
      : async () =>
          browser.tabs.sendMessage(
            target.tabId,
            makeMessage(type, args),
            // `frameId` must be specified. If missing, the message is sent to every frame
            { frameId: target.frameId ?? 0 }
          );

    return manageConnection(type, options, sendMessage);
  };

  return publicMethod as PublicMethod;
}

/**
 * Replicates the original method, including its types.
 * To be called in the sender’s end.
 */
function getMethod<
  Type extends keyof MessengerMethods,
  Method extends MessengerMethods[Type],
  PublicMethodType extends PublicMethod<Method>
>(
  type: Type,
  options: { isNotification: true }
): SetReturnType<PublicMethodType, void>;
function getMethod<
  Type extends keyof MessengerMethods,
  Method extends MessengerMethods[Type],
  PublicMethodType extends PublicMethod<Method>
>(type: Type, options?: Options): PublicMethodType;
function getMethod<
  Type extends keyof MessengerMethods,
  Method extends MessengerMethods[Type],
  PublicMethodType extends PublicMethod<Method>
>(type: Type, options: Options = {}): PublicMethodType {
  const publicMethod = (...args: Parameters<Method>) => {
    if (isBackgroundPage()) {
      const handler = handlers.get(type);
      if (handler) {
        console.warn("Messenger:", type, "is being handled locally");
        return handler.apply({ trace: [] }, args);
      }

      throw new MessengerError("No handler registered for " + type);
    }

    const sendMessage = async () =>
      browser.runtime.sendMessage(makeMessage(type, args));

    return manageConnection(type, options, sendMessage);
  };

  return publicMethod as PublicMethodType;
}

function registerMethods(methods: Partial<MessengerMethods>): void {
  for (const [type, method] of Object.entries(methods)) {
    if (handlers.has(type)) {
      throw new MessengerError(`Handler already set for ${type}`);
    }

    console.debug(`Messenger: Registered`, type);
    handlers.set(type, method as Method);
  }

  browser.runtime.onMessage.addListener(onMessageListener);
}

export { getMethod, getContentScriptMethod, registerMethods };
