import pRetry from "p-retry";
import { deserializeError, serializeError } from "serialize-error";
import { SetReturnType } from "type-fest";
import { isBackgroundPage } from "webext-detect-page";
import {
  Message,
  MessengerMessage,
  MessengerMeta,
  MessengerResponse,
  Method,
  NamedTarget,
  PublicMethod,
  PublicMethodWithTarget,
  Target,
} from "./types";

export { MessengerMeta, Target, NamedTarget };

const errorNonExistingTarget =
  "Could not establish connection. Receiving end does not exist.";

// The global interface is used to declare the types of the methods.
// This "empty" declaration helps the local code understand what
// `MessengerMethods[string]` may look like. Do not use `Record<string, Method>`
// because an index signature would allow any string to return Method and
// it would make `getMethod` too loose.
declare global {
  interface MessengerMethods {
    _: Method;
    __webextMessengerTargetRegistration: typeof _registerTarget;
  }
}

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
    if (!isBackgroundPage()) {
      console.warn(
        "Messenger:",
        message.type,
        "received but ignored; Wrong context"
      );
      return;
    }

    const resolvedTarget =
      "name" in message.target
        ? resolveNamedTarget(message.target, sender.trace[0])
        : message.target;
    const publicMethod = getContentScriptMethod(message.type);
    return handleCall(
      message,
      sender,
      publicMethod(resolvedTarget, ...message.args)
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
      if (!String(error?.message).startsWith(errorNonExistingTarget)) {
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
  target?: Target | NamedTarget
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
  const publicMethod = (
    target: Target | NamedTarget,
    ...args: Parameters<Method>
  ) => {
    // Named targets and contexts without direct Tab access must go through background, unless we're already in it
    if (!browser.tabs || ("name" in target && !isBackgroundPage())) {
      return manageConnection(type, options, async () =>
        browser.runtime.sendMessage(makeMessage(type, args, target))
      );
    }

    const resolvedTarget =
      "name" in target ? resolveNamedTarget(target) : target;

    // `frameId` must be specified. If missing, the message is sent to every frame
    const { tabId, frameId = 0 } = resolvedTarget;

    // Message tab directly
    return manageConnection(type, options, async () =>
      browser.tabs.sendMessage(tabId, makeMessage(type, args), { frameId })
    );
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

  // Use "chrome" because the polyfill might not be available when `_registerTarget` is registered
  if ("browser" in globalThis) {
    browser.runtime.onMessage.addListener(onMessageListener);
  } else {
    console.error(
      "Messenger: webextension-polyfill was not loaded in time, this might cause a runtime error later"
    );
    // @ts-expect-error Temporary workaround until I drop the webextension-polyfill dependency
    chrome.runtime.onMessage.addListener(onMessageListener);
  }
}

// TODO: Remove targets after tab closes to avoid "memory leaks"
const targets = new Map<string, Target>();

/** Register the current context so that it can be targeted with a name */
const registerTarget = getMethod("__webextMessengerTargetRegistration");

function _registerTarget(this: MessengerMeta, name: string): void {
  const sender = this.trace[0]!;
  const tabId = sender.tab!.id!;
  const { frameId } = sender;
  targets.set(`${tabId}%${name}`, {
    tabId,
    frameId,
  });

  console.debug(`Messenger: Target "${name}" registered for tab ${tabId}`);
}

function resolveNamedTarget(
  target: NamedTarget,
  sender?: browser.runtime.MessageSender
): Target {
  if (!isBackgroundPage()) {
    throw new Error(
      "Named targets can only be resolved in the background page"
    );
  }

  const {
    name,
    tabId = sender?.tab?.id, // If not specified, try to use the sender’s
  } = target;
  if (typeof tabId === "undefined") {
    throw new TypeError(
      `${errorNonExistingTarget} The tab ID was not specified nor it was automatically determinable.`
    );
  }

  const resolvedTarget = targets.get(`${tabId}%${name}`);
  if (!resolvedTarget) {
    throw new Error(
      `${errorNonExistingTarget} Target named ${name} not registered for tab ${tabId}.`
    );
  }

  return resolvedTarget;
}

if (isBackgroundPage()) {
  registerMethods({
    __webextMessengerTargetRegistration: _registerTarget,
  });
}

export { getMethod, getContentScriptMethod, registerMethods, registerTarget };
