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

export function isMessengerMessage(message: unknown): message is Message {
  return (
    isObject(message) &&
    typeof message["type"] === "string" &&
    message["__webextMessenger"] === true &&
    Array.isArray(message["args"])
  );
}

function onMessageListener(
  message: unknown,
  sender: Sender,
  sendResponse: (response: unknown) => void,
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

  (async () => {
    try {
      sendResponse(await handleMessage(message, sender, action));
    } catch (error) {
      sendResponse({ __webextMessenger: true, error: serializeError(error) });
    }
  })();

  return true;
}

// This function can only be called when the message *will* be handled locally.
// Returning "undefined" or throwing an error will still handle it.
async function handleMessage(
  message: Message,
  sender: Sender,

  // Once messages reach this function they cannot be "ignored", they're already being handled
  action: "respond" | "forward",
): Promise<unknown> {
  const { type, target, args, options = {} } = message;

  const { trace = [], seq } = options;
  trace.push(sender);
  const meta: MessengerMeta = { trace };

  let handleMessage: () => Promise<unknown>;

  if (action === "forward") {
    log.debug(type, seq, "🔀 forwarded", { sender, target });
    handleMessage = async () => messenger(type, meta, target, ...args);
  } else {
    log.debug(type, seq, "↘️ received in", getContextName(), {
      sender,
      args,
      wasForwarded: trace.length > 1,
    });

    const localHandler = handlers.get(type);
    if (!localHandler) {
      if (!didUserRegisterMethods()) {
        // TODO: Test the handling of __getTabData in contexts that have no registered methods
        // https://github.com/pixiebrix/webext-messenger/pull/82
        throw new MessengerError(
          `No handlers registered in ${getContextName()}`,
        );
      }

      throw new MessengerError(
        `No handler registered for ${type} in ${getContextName()}`,
      );
    }

    handleMessage = async () => localHandler.apply(meta, args);
  }

  const response = await handleMessage().then(
    (value) => ({ value }),
    (error: unknown) => ({
      // Errors must be serialized because the stack traces are currently lost on Chrome
      error: serializeError(error),
    }),
  );

  log.debug(type, seq, "↗️ responding", response);
  return { ...response, __webextMessenger };
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

  // Only available in the background worker
  chrome.runtime.onMessageExternal?.addListener(onMessageListener);
}

/** Ensure/document that the current function was called via Messenger */
export function assertMessengerCall(
  _this: MessengerMeta,
  // eslint-disable-next-line @typescript-eslint/no-empty-function -- TypeScript already does this, it's a documentation-only call
): asserts _this is MessengerMeta {}
