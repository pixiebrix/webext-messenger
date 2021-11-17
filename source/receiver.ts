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
import { getContextName } from "webext-detect-page";
import { isThisTarget, nameThisTarget } from "./thisTarget.js";

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

  // Target check must be synchronous or else we need to handle the message
  if (isThisTarget(message.target) === undefined) {
    console.warn("A message was received before this context was ready");
    return; // If this *was* the target, then probably no one else answered
  }

  return handleMessage(message, sender);
}

// This function can only be called when the message *will* be handled locally.
// Returning "undefined" or throwing an error will still handle it.
async function handleMessage(
  message: Message,
  sender: Sender
): Promise<unknown> {
  const { type, target, args, options: { trace } = {} } = message;

  debug(type, "↘️ received", { sender, args });

  let handleMessage: () => Promise<unknown>;

  if (isThisTarget(target)) {
    const localHandler = handlers.get(type);
    if (!localHandler) {
      throw new MessengerError(
        `No handler registered for ${type} in ${getContextName()}`
      );
    }

    debug(type, "➡️ will be handled here");

    const meta: MessengerMeta = { trace: [sender] };
    handleMessage = async () => localHandler.apply(meta, args);
  } else if (browser.tabs) {
    // TODO: double-check this logic
    debug(type, "🔀 forwarded", { sender, target });
    handleMessage = async () => messenger(type, { trace }, target, ...args);
  } else {
    throw new MessengerError(
      `Message ${type} sent to wrong context, it can't be forwarded to ${JSON.stringify(
        target
      )}`
    );
  }

  return handleMessage()
    .then(
      (value) => ({ value }),
      (error: unknown) => ({
        // Errors must be serialized because the stacktraces are currently lost on Chrome
        // and https://github.com/mozilla/webextension-polyfill/issues/210
        error: serializeError(error),
      })
    )
    .then((response) => {
      debug(type, "↗️ responding", response);
      return { ...response, __webextMessenger };
    });
}

export function registerMethods(methods: Partial<MessengerMethods>): void {
  void nameThisTarget();

  for (const [type, method] of Object.entries(methods)) {
    if (handlers.has(type)) {
      throw new MessengerError(`Handler already set for ${type}`);
    }

    console.debug("Messenger: Registered", type);
    handlers.set(type, method as Method);
  }

  if ("browser" in globalThis) {
    browser.runtime.onMessage.addListener(onMessageListener);
  } else {
    throw new Error("`webext-messenger` requires `webextension-polyfill`");
  }
}
