import pRetry from "p-retry";
import { SetReturnType } from "type-fest";
import { isBackgroundPage } from "webext-detect-page";
import { deserializeError } from "serialize-error";

import {
  MessengerMessage,
  MessengerResponse,
  PublicMethod,
  PublicMethodWithTarget,
  Options,
  NamedTarget,
  Target,
} from "./types";
import {
  isObject,
  MessengerError,
  __webext_messenger__,
  handlers,
} from "./shared";
import { targets } from "./namedTargets";

export const errorNonExistingTarget =
  "Could not establish connection. Receiving end does not exist.";

function isMessengerResponse(response: unknown): response is MessengerResponse {
  return isObject(response) && response["__webext_messenger__"] === true;
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

export function resolveNamedTarget(
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

export { getContentScriptMethod, getMethod };
