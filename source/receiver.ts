import { serializeError } from "serialize-error";
import { getContextName } from "webext-detect-page";

import { messenger } from "./sender.js";
import {
  type Message,
  type MessengerMeta,
  type Method,
  type Sender,
} from "./types.js";
import {
  isObject,
  MessengerError,
  debug,
  __webextMessenger,
} from "./shared.js";
import { getActionForMessage } from "./thisTarget.js";
import { didUserRegisterMethods, handlers } from "./handlers.js";

export function isMessengerMessage(message: unknown): message is Message {
  return (
    isObject(message) &&
    typeof message["type"] === "string" &&
    message["__webextMessenger"] === true &&
    Array.isArray(message["args"])
  );
}

// MUST NOT be `async` or Promise-returning-only
function onMessageListener(
  message: unknown,
  sender: Sender
): Promise<unknown> | void {
  if (!isMessengerMessage(message)) {
    // TODO: Add test for this eventuality: ignore unrelated messages
    return;
  }

  // Target check must be synchronous (`await` means we're handling the message)
  const action = getActionForMessage(sender, message);
  if (action === "ignore") {
    return;
  }

  return handleMessage(message, sender, action);
}

// This function can only be called when the message *will* be handled locally.
// Returning "undefined" or throwing an error will still handle it.
async function handleMessage(
  message: Message,
  sender: Sender,

  // Once messages reach this function they cannot be "ignored", they're already being handled
  action: "respond" | "forward"
): Promise<unknown> {
  const { type, target, args, options = {} } = message;

  const { trace = [] } = options;
  trace.push(sender);
  const meta: MessengerMeta = { trace, __webextMessenger: true };

  let handleMessage: () => Promise<unknown>;

  if (action === "forward") {
    debug(type, "🔀 forwarded", { sender, target });
    handleMessage = async () => messenger(type, meta, target, ...args);
  } else {
    debug(type, "↘️ received in", getContextName(), {
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
          `No handlers registered in ${getContextName()}`
        );
      }

      throw new MessengerError(
        `No handler registered for ${type} in ${getContextName()}`
      );
    }

    handleMessage = async () => localHandler.apply(meta, args);
  }

  const response = await handleMessage().then(
    (value) => ({ value }),
    (error: unknown) => ({
      // Errors must be serialized because the stack traces are currently lost on Chrome
      // and https://github.com/mozilla/webextension-polyfill/issues/210
      error: serializeError(error),
    })
  );

  debug(type, "↗️ responding", response);
  return { ...response, __webextMessenger };
}

export function registerMethods(methods: Partial<MessengerMethods>): void {
  for (const [type, method] of Object.entries(methods)) {
    if (handlers.has(type)) {
      throw new MessengerError(`Handler already set for ${type}`);
    }

    debug("Registered", type);
    handlers.set(type, method as Method);
  }

  browser.runtime.onMessage.addListener(onMessageListener);
}

/** Ensure/document that the current function was called via Messenger */
export function assertMessengerCall(
  _this: MessengerMeta
  // eslint-disable-next-line @typescript-eslint/no-empty-function -- TypeScript already does this, it's a documentation-only call
): asserts _this is MessengerMeta {}
