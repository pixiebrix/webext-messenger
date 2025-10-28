import { serializeError } from "serialize-error";
import { getContextName, isBackground } from "webext-detect";

import { messenger } from "./sender.js";
import {
  type Message,
  type ExternalMessage,
  type MessengerMeta,
  type Method,
  type Sender,
  type Options,
} from "./types.js";
import { isObject, MessengerError, __webextMessenger } from "./shared.js";
import { log } from "./logging.js";
import { getActionForMessage } from "./targetLogic.js";
import { didUserRegisterMethods, handlers } from "./handlers.js";
import { getTabDataStatus, thisTarget } from "./thisTarget.js";

type SendResponse = (response: unknown) => void;

const externalMethods = new Set<keyof MessengerMethods>();

export function isMessengerMessage(message: unknown): message is Message {
  return (
    isObject(message) &&
    typeof message["type"] === "string" &&
    message["__webextMessenger"] === true &&
    Array.isArray(message["args"])
  );
}

export function isExternalMessengerMessage(
  message: unknown,
): message is ExternalMessage {
  return (
    isMessengerMessage(message) &&
    isObject(message.target) &&
    Object.keys(message.target).length === 1 && // Ensure it's *only* `extensionId`
    typeof message.target.extensionId === "string"
  );
}

/**
 * Decides what to do with a message and sends a response (value or error) back to the sender.
 *
 * @warn This function cannot return a Promise.
 * @warn Limit the amount of logic here because errors won't make it to `sendResponse`
 */
//
function onMessageListener(
  message: unknown,
  sender: Sender,
  sendResponse: SendResponse,
): true | undefined {
  if (!isMessengerMessage(message)) {
    // TODO: Add test for this eventuality: ignore unrelated messages
    return;
  }

  // Target check must be synchronous (`await` means we're handling the message)
  const action = getActionForMessage(sender, message.target, thisTarget);
  if (action === "ignore") {
    log.debug(message.type, "🤫 ignored due to target mismatch", {
      requestedTarget: message.target,
      thisTarget,
      tabDataStatus: getTabDataStatus(),
    });
    return;
  }

  const { type, target, args, options = {} } = message;
  const { trace = [], seq, retry } = options;

  if (action === "forward") {
    log.debug(type, seq, "🔀 forwarded", { sender, target });
  } else {
    log.debug(type, seq, "↘️ received in", getContextName(), {
      sender,
      args,
      wasForwarded: trace.length > 1,
    });
  }

  // Prepare the response asynchronously because the listener must return `true` synchronously
  (async () => {
    try {
      trace.push(sender);

      const value = await prepareResponse(message, action, { trace, retry });
      log.debug(type, seq, "↗️ responding", { value });
      sendResponse({ __webextMessenger, value });
    } catch (error) {
      log.debug(type, seq, "↗️ responding", { error });
      sendResponse({ __webextMessenger, error: serializeError(error) });
    }
  })();

  // This indicates that the message is being handled and a response will be sent asynchronously.
  // It can be improved if this is ever implemented https://issues.chromium.org/issues/40753031
  return true;
}

/**
 * Early validation to ensure that the message matches the specific allowed target
 * before letting it flow into the rest of messenger. An malicious message might
 * otherwise pass internal checks and be forwarded to the wrong context.
 * @warn Do not remove. Keep as a security measure.
 */
function onMessageExternalListener(
  message: unknown,
  sender: Sender,
  sendResponse: SendResponse,
): true | void {
  if (
    isExternalMessengerMessage(message) &&
    message.target.extensionId === chrome.runtime.id
  ) {
    return onMessageListener(message, sender, sendResponse);
  }

  log.debug("Ignored external message", {
    message,
    sender,
  });
}

/** Generates the value or error to return to the sender; does not include further messaging logic */
async function prepareResponse(
  message: Message,
  action: "respond" | "forward",
  options: Options,
): Promise<unknown> {
  const { type, target, args } = message;

  if (action === "forward") {
    return messenger(type, options, target, ...args);
  }

  const localHandler = handlers.get(type);
  if (localHandler) {
    if ("extensionId" in target && !externalMethods.has(type)) {
      throw new MessengerError(
        `The ${type} handler is registered in ${getContextName()} for internal use only`,
      );
    }

    const { trace = [] } = options;
    return localHandler.apply({ trace }, args);
  }

  if (didUserRegisterMethods()) {
    throw new MessengerError(
      `No handler registered for ${type} in ${getContextName()}`,
    );
  }

  // TODO: Test the handling of __getTabData in contexts that have no registered methods
  // https://github.com/pixiebrix/webext-messenger/pull/82
  throw new MessengerError(`No handlers registered in ${getContextName()}`);
}

export function registerMethods(methods: Partial<MessengerMethods>): void {
  for (const [type, method] of Object.entries(methods)) {
    if (handlers.has(type)) {
      throw new MessengerError(`Handler already set for ${type}`);
    }

    log.debug("Registered", type);
    handlers.set(type, method as Method);
  }

  chrome.runtime.onMessage.addListener(onMessageListener);

  // Only handle direct-to-background messages for now
  if (isBackground()) {
    chrome.runtime.onMessageExternal.addListener(onMessageExternalListener);
  }
}

export function exposeMethodsToExternalMessaging(
  ...types: Array<keyof MessengerMethods>
): void {
  for (const type of types) {
    externalMethods.add(type);
  }
}

/** Ensure/document that the current function was called via Messenger */
export function assertMessengerCall(
  _this: MessengerMeta,
  // eslint-disable-next-line @typescript-eslint/no-empty-function -- TypeScript already does this, it's a documentation-only call
): asserts _this is MessengerMeta {}
