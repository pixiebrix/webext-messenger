import { serializeError } from "serialize-error";
import { isBackgroundPage } from "webext-detect-page";

import { getContentScriptMethod } from "./sender.js";
import { resolveNamedTarget } from "./namedTargets.js";
import { Message, MessengerMeta, MessengerResponse, Method } from "./types.js";
import {
  handlers,
  isObject,
  MessengerError,
  __webext_messenger__,
} from "./shared.js";

export function isMessengerMessage(message: unknown): message is Message {
  return (
    isObject(message) &&
    typeof message["type"] === "string" &&
    message["__webext_messenger__"] === true &&
    Array.isArray(message["args"])
  );
}

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

export function registerMethods(methods: Partial<MessengerMethods>): void {
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
