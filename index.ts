import { deserializeError, ErrorObject, serializeError } from "serialize-error";

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

/* OmitThisParameter doesn't seem to do anything on pixiebrix-extension… */
type ActuallyOmitThisParameter<T> = T extends (...args: infer A) => infer R
  ? (...args: A) => R
  : T;

export type MessengerMeta = browser.runtime.MessageSender;
export interface MessengerResponse {
  __webext_messenger__: InternalMessengerResponse;
}

type InternalMessengerResponse =
  | {
      value: unknown;
    }
  | {
      error: ErrorObject;
    };

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Unused, in practice
type Arguments = any[];
type Method = (this: MessengerMeta, ...args: Arguments) => Promise<unknown>;

// TODO: It may include additional meta, like information about the original sender
type Message<TArguments extends Arguments = Arguments> = {
  type: string;
  args: TArguments;
};

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isMessengerMessage(value: unknown): value is Message {
  return (
    isObject(value) &&
    typeof value["type"] === "string" &&
    typeof value["__webext_messenger__"] === "boolean" &&
    Array.isArray(value["args"])
  );
}

function isMessengerResponse(value: unknown): value is MessengerResponse {
  return isObject(value) && typeof value["__webext_messenger__"] === "object";
}

const handlers = new Map<string, Method>();

async function handleMessage(
  message: Message,
  sender: MessengerMeta
): Promise<InternalMessengerResponse> {
  const handler = handlers.get(message.type);
  if (!handler) {
    throw new Error("No handler registered for " + message.type);
  }

  try {
    return { value: await handler.call(sender, ...message.args) };
  } catch (error: unknown) {
    // Errors must be serialized because the stacktraces are currently lost on Chrome and
    // https://github.com/mozilla/webextension-polyfill/issues/210
    return { error: serializeError(error) };
  }
}

async function handleResponse(response: unknown): Promise<unknown> {
  if (!isMessengerResponse(response)) {
    // If the response is `undefined`, `registerMethod` was never called
    throw new Error("No handlers registered in receiving end");
  }

  if ("error" in response.__webext_messenger__) {
    throw deserializeError(response.__webext_messenger__.error);
  }

  return response.__webext_messenger__.value;
}

// MUST NOT be `async` or Promise-returning-only
function onMessageListener(
  message: unknown,
  sender: MessengerMeta
): Promise<unknown> | void {
  if (!isMessengerMessage(message)) {
    return;
  }

  return handleMessage(message, sender).then((response) => {
    return {
      __webext_messenger__: response,
    };
  });
}

export interface Target {
  tabId: number;
  frameId?: number;
}

type WithTarget<TMethod> = TMethod extends (
  ...args: infer PreviousArguments
) => infer TReturnValue
  ? (target: Target, ...args: PreviousArguments) => TReturnValue
  : never;

/**
 * Replicates the original method, including its types.
 * To be called in the sender’s end.
 */
export function getContentScriptMethod<
  TType extends keyof MessengerMethods,
  TMethod extends MessengerMethods[TType],
  // The original Method might have `this` (Meta) specified, but this isn't applicable here
  PublicMethod extends WithTarget<ActuallyOmitThisParameter<TMethod>>
>(type: TType): PublicMethod {
  const publicMethod = async (target: Target, ...args: Parameters<TMethod>) => {
    // TODO: This will throw if the receiving end doesn't exist,
    //  i.e. if registerMethods hasn't been called
    const response: unknown = await browser.tabs.sendMessage(
      target.tabId,
      {
        // Guarantees that a message is meant to be handled by this library
        __webext_messenger__: true,
        type,
        args,
      },
      {
        // Must be specified. If missing, the message would be sent to every frame
        frameId: target.frameId ?? 0,
      }
    );

    return handleResponse(response);
  };

  return publicMethod as PublicMethod;
}

/**
 * Replicates the original method, including its types.
 * To be called in the sender’s end.
 */
export function getMethod<
  TType extends keyof MessengerMethods,
  TMethod extends MessengerMethods[TType],
  // The original Method might have `this` (Meta) specified, but this isn't applicable here
  PublicMethod extends ActuallyOmitThisParameter<TMethod>
>(type: TType): PublicMethod {
  const publicMethod = async (...args: Parameters<TMethod>) => {
    // TODO: This will throw if the receiving end doesn't exist,
    //  i.e. if registerMethods hasn't been called
    const response: unknown = await browser.runtime.sendMessage({
      // Guarantees that a message is meant to be handled by this library
      __webext_messenger__: true,
      type,
      args,
    });

    return handleResponse(response);
  };

  return publicMethod as PublicMethod;
}

export function registerMethods(methods: Partial<MessengerMethods>): void {
  for (const [type, method] of Object.entries(methods)) {
    if (handlers.has(type)) {
      throw new Error(`Handler already set for ${type}`);
    }

    handlers.set(type, method);
  }

  browser.runtime.onMessage.addListener(onMessageListener);
}
