import browser from "webextension-polyfill";
import { serializeError } from "serialize-error";

import { messenger } from "./sender.js";
import { Message, MessengerMeta, Method, Sender } from "./types.js";
import {
  handlers,
  isObject,
  MessengerError,
  debug,
  __webextMessenger,
} from "./shared.js";
import { getContextName, isBackgroundPage } from "webext-detect-page";
import { getActionForMessage, nameThisTarget } from "./thisTarget.js";

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
  const action = getActionForMessage(sender, message.target);
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
  const { type, target, args, options: { trace } = {} } = message;

  debug(type, "↘️ received", { sender, args });

  let handleMessage: () => Promise<unknown>;

  if (action === "forward") {
    debug(type, "🔀 forwarded", { sender, target });
    handleMessage = async () => messenger(type, { trace }, target, ...args);
  } else {
    const localHandler = handlers.get(type);
    if (!localHandler) {
      throw new MessengerError(
        `No handler registered for ${type} in ${getContextName()}`
      );
    }

    debug(type, "➡️ will be handled here");

    const meta: MessengerMeta = { trace: [sender] };
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
  if (!isBackgroundPage()) {
    void nameThisTarget();
  }

  for (const [type, method] of Object.entries(methods)) {
    if (handlers.has(type)) {
      throw new MessengerError(`Handler already set for ${type}`);
    }

    console.debug("Messenger: Registered", type);
    handlers.set(type, method as Method);
  }

  browser.runtime.onMessage.addListener(onMessageListener);
}
