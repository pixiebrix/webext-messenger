import { deserializeError, serializeError } from "serialize-error";

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

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Unused, in practice
type Arguments = any[];
type Method = (this: MessengerMeta, ...args: Arguments) => Promise<unknown>;

// TODO: It may include additional meta, like information about the original sender
type Message<TArguments extends Arguments = Arguments> = {
  type: string;
  args: TArguments;
};

const errorKey = "__webext_messenger_error_response__";

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

const handlers = new Map<string, Method>();

// MUST NOT be `async` or Promise-returning-only
function onMessageListener(
  message: unknown,
  sender: MessengerMeta
): Promise<unknown> | void {
  if (!isMessengerMessage(message)) {
    return;
  }

  const handler = handlers.get(message.type);
  if (handler) {
    return handler.call(sender, ...message.args).catch((error: unknown) => ({
      // Errors must be serialized because the stacktraces are currently lost on Chrome and
      // https://github.com/mozilla/webextension-polyfill/issues/210
      [errorKey]: serializeError(error),
    }));
  }

  throw new Error("No handler registered for " + message.type);
}

/**
 * Replicates the original method, including its types.
 * To be called in the sender’s end.
 */
export function getMethod<
  TType extends keyof MessengerMethods,
  TMethod extends MessengerMethods[TType],
  PublicMethod extends ActuallyOmitThisParameter<TMethod>
  // The original Method might have `this` (Meta) specified, but this isn't applicable here
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

    if (isObject(response) && errorKey in response) {
      throw deserializeError(response[errorKey]);
    }

    return response;
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
