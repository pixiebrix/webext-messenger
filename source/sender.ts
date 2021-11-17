import browser from "webextension-polyfill";
import pRetry from "p-retry";
import { isBackgroundPage } from "webext-detect-page";
import { deserializeError } from "serialize-error";

import {
  MessengerMessage,
  MessengerResponse,
  PublicMethod,
  PublicMethodWithTarget,
  Options,
  Target,
  PageTarget,
} from "./types.js";
import {
  isObject,
  MessengerError,
  __webextMessenger,
  handlers,
  debug,
  warn,
} from "./shared.js";
import { SetReturnType } from "type-fest";

export const errorNonExistingTarget =
  "Could not establish connection. Receiving end does not exist.";

function isMessengerResponse(response: unknown): response is MessengerResponse {
  return isObject(response) && response["__webextMessenger"] === true;
}

function makeMessage(
  type: keyof MessengerMethods,
  args: unknown[],
  target: Target | PageTarget,
  options: Options
): MessengerMessage {
  return {
    __webextMessenger,
    type,
    args,
    target,
    options,
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
    debug(type, "↘️ replied with error", response.error);
    throw deserializeError(response.error);
  }

  debug(type, "↘️ replied successfully", response.value);
  return response.value;
}

function messenger<
  Type extends keyof MessengerMethods,
  Method extends MessengerMethods[Type]
>(
  type: Type,
  options: { isNotification: true },
  target: Target | PageTarget,
  ...args: Parameters<Method>
): void;
function messenger<
  Type extends keyof MessengerMethods,
  Method extends MessengerMethods[Type],
  ReturnValue extends Promise<ReturnType<Method>>
>(
  type: Type,
  options: Options,
  target: Target | PageTarget,
  ...args: Parameters<Method>
): ReturnValue;
function messenger<
  Type extends keyof MessengerMethods,
  Method extends MessengerMethods[Type],
  ReturnValue extends Promise<ReturnType<Method>>
>(
  type: Type,
  options: Options,
  target: Target | PageTarget,
  ...args: Parameters<Method>
): ReturnValue | void {
  if ("page" in target) {
    if (target.page === "background" && isBackgroundPage()) {
      const handler = handlers.get(type);
      if (handler) {
        warn(type, "is being handled locally");
        return handler.apply({ trace: [] }, args) as ReturnValue;
      }

      throw new MessengerError("No handler registered for " + type);
    }

    const sendMessage = async () => {
      debug(type, "↗️ sending message to runtime");
      return browser.runtime.sendMessage(
        makeMessage(type, args, target, options)
      );
    };

    return manageConnection(type, options, sendMessage) as ReturnValue;
  }

  // Contexts without direct Tab access must go through background
  if (!browser.tabs) {
    return manageConnection(type, options, async () => {
      debug(type, "↗️ sending message to runtime");
      return browser.runtime.sendMessage(
        makeMessage(type, args, target, options)
      );
    }) as ReturnValue;
  }

  // `frameId` must be specified. If missing, the message is sent to every frame
  const { tabId, frameId = 0 } = target;

  // Message tab directly
  return manageConnection(type, options, async () => {
    debug(type, "↗️ sending message to tab", tabId, "frame", frameId);
    return browser.tabs.sendMessage(
      tabId,
      makeMessage(type, args, target, options),
      {
        frameId,
      }
    );
  }) as ReturnValue;
}

function getMethod<
  Type extends keyof MessengerMethods,
  Method extends MessengerMethods[Type],
  PublicMethodType extends PublicMethod<Method>
>(type: Type, target: Target | PageTarget): PublicMethodType;
function getMethod<
  Type extends keyof MessengerMethods,
  Method extends MessengerMethods[Type],
  PublicMethodWithDynamicTarget extends PublicMethodWithTarget<Method>
>(type: Type): PublicMethodWithDynamicTarget;
function getMethod<
  Type extends keyof MessengerMethods,
  Method extends MessengerMethods[Type],
  PublicMethodType extends PublicMethod<Method>,
  PublicMethodWithDynamicTarget extends PublicMethodWithTarget<Method>
>(
  type: Type,
  target?: Target | PageTarget
): PublicMethodType | PublicMethodWithDynamicTarget {
  if (arguments.length === 1) {
    return messenger.bind(undefined, type, {}) as PublicMethodWithDynamicTarget;
  }

  // @ts-expect-error `bind` types are junk
  return messenger.bind(undefined, type, {}, target) as PublicMethodType;
}

function getNotifier<
  Type extends keyof MessengerMethods,
  Method extends MessengerMethods[Type],
  PublicMethodType extends SetReturnType<PublicMethod<Method>, void>
>(type: Type, target: Target | PageTarget): PublicMethodType;
function getNotifier<
  Type extends keyof MessengerMethods,
  Method extends MessengerMethods[Type],
  PublicMethodWithDynamicTarget extends SetReturnType<
    PublicMethodWithTarget<Method>,
    void
  >
>(type: Type): PublicMethodWithDynamicTarget;
function getNotifier<
  Type extends keyof MessengerMethods,
  Method extends MessengerMethods[Type],
  PublicMethodType extends SetReturnType<PublicMethod<Method>, void>,
  PublicMethodWithDynamicTarget extends SetReturnType<
    PublicMethodWithTarget<Method>,
    void
  >
>(
  type: Type,
  target?: Target | PageTarget
): PublicMethodType | PublicMethodWithDynamicTarget {
  const options = { isNotification: true };
  if (arguments.length === 1) {
    // @ts-expect-error `bind` types are junk
    return messenger.bind(
      undefined,
      type,
      options
    ) as PublicMethodWithDynamicTarget;
  }

  // @ts-expect-error `bind` types are junk
  return messenger.bind(undefined, type, options, target) as PublicMethodType;
}

export { messenger, getMethod, getNotifier };
export const backgroundTarget: PageTarget = { page: "background" };
