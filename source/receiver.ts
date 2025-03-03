import { serializeError } from "serialize-error";
import { getContextName } from "webext-detect";

import { messenger } from "./sender.js";
import {
  type Message,
  type MessengerMeta,
  type Method,
  type Sender,
} from "./types.js";
import { isObject, MessengerError, __webextMessenger } from "./shared.js";
import { log } from "./logging.js";
import { getActionForMessage } from "./targetLogic.js";
import { didUserRegisterMethods, handlers } from "./handlers.js";
import { getTabDataStatus, thisTarget } from "./thisTarget.js";

type SendResponse = (response: unknown) => void;

export function isMessengerMessage(message: unknown): message is Message {
  return (
    isObject(message) &&
    typeof message["type"] === "string" &&
    message["__webextMessenger"] === true &&
    Array.isArray(message["args"])
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
  const { trace = [], seq } = options;

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

      const value = await prepareResponse(message, action, { trace });
      log.debug(type, seq, "↗️ responding", { value });
      sendResponse({ __webextMessenger, value });
    } catch (error) {
      log.debug(type, seq, "↗️ responding", { error });
      sendResponse({ __webextMessenger, error: serializeError(error) });
    }
  })();

  // This indicates that the message is being handled and a response will be sent asynchronously
  // TODO: Just return a promise if this is ever implemented https://issues.chromium.org/issues/40753031
  return true;
}

/** Generates the value or error to return to the sender; does not include further messaging logic */
async function prepareResponse(
  message: Message,
  action: "respond" | "forward",
  meta: MessengerMeta,
): Promise<unknown> {
  const { type, target, args } = message;

  if (action === "forward") {
    return messenger(type, meta, target, ...args);
  }

  const localHandler = handlers.get(type);
  if (localHandler) {
    return localHandler.apply(meta, args);
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
}

/** Ensure/document that the current function was called via Messenger */
export function assertMessengerCall(
  _this: MessengerMeta,
  // eslint-disable-next-line @typescript-eslint/no-empty-function -- TypeScript already does this, it's a documentation-only call
): asserts _this is MessengerMeta {}
