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
  meta: MessengerMeta,
  call: Promise<unknown> | unknown
): Promise<MessengerResponse> {
  console.debug(`Messenger:`, message.type, message.args, "from", { meta });
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

function getHandler(
  message: Message,
  sender: browser.runtime.MessageSender
): Method | void {
  if (message.target && !isBackgroundPage()) {
    console.warn(
      "Messenger:",
      message.type,
      "received but ignored; Wrong context"
    );
    return;
  }

  if (message.target) {
    const resolvedTarget =
      "name" in message.target
        ? resolveNamedTarget(message.target, sender)
        : message.target;
    const publicMethod = getContentScriptMethod(message.type);

    // @ts-expect-error You're wrong, TypeScript
    return publicMethod.bind(undefined, resolvedTarget);
  }

  const handler = handlers.get(message.type);
  if (handler) {
    return handler;
  }
}

// MUST NOT be `async` or Promise-returning-only
function onMessageListener(
  message: unknown,
  sender: browser.runtime.MessageSender
): Promise<unknown> | void {
  if (!isMessengerMessage(message)) {
    // TODO: Add test for this eventuality: ignore unrelated messages
    return;
  }

  const handler = getHandler(message, sender);
  if (handler) {
    const meta: MessengerMeta = { trace: [sender] };
    return handleCall(message, meta, handler.apply(meta, message.args));
  }

  // More context in https://github.com/pixiebrix/webext-messenger/issues/45
  console.warn(
    "Messenger:",
    message.type,
    "received but ignored; No handlers were registered here"
  );
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
