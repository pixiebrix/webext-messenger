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
  Target,
} from "./types.js";
import {
  isObject,
  MessengerError,
  __webextMessenger,
  handlers,
  debug,
  warn,
} from "./shared.js";

export const errorNonExistingTarget =
  "Could not establish connection. Receiving end does not exist.";

function isMessengerResponse(response: unknown): response is MessengerResponse {
  return isObject(response) && response["__webextMessenger"] === true;
}

function makeMessage(
  type: keyof MessengerMethods,
  args: unknown[],
  target?: Target
): MessengerMessage {
  return {
    __webextMessenger,
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
    debug(type, "notification failed", { error });
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

      debug(type, "will retry");
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
  const publicMethod = (target: Target, ...args: Parameters<Method>) => {
    // Contexts without direct Tab access must go through background
    if (!browser.tabs) {
      return manageConnection(type, options, async () => {
        debug(type, "↗️ sending message to runtime");
        return browser.runtime.sendMessage(makeMessage(type, args, target));
      });
    }

    // `frameId` must be specified. If missing, the message is sent to every frame
    const { tabId, frameId = 0 } = target;

    // Message tab directly
    return manageConnection(type, options, async () => {
      debug(type, "↗️ sending message to tab", tabId, "frame", frameId);
      return browser.tabs.sendMessage(tabId, makeMessage(type, args), {
        frameId,
      });
    });
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
        warn(type, "is being handled locally");
        return handler.apply({ trace: [] }, args);
      }

      throw new MessengerError("No handler registered for " + type);
    }

    const sendMessage = async () => {
      debug(type, "↗️ sending message to runtime");
      return browser.runtime.sendMessage(makeMessage(type, args));
    };

    return manageConnection(type, options, sendMessage);
  };

  return publicMethod as PublicMethodType;
}

export { getContentScriptMethod, getMethod };
