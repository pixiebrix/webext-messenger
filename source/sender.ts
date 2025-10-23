import { isBackground, isExtensionContext } from "webext-detect";
import { deserializeError } from "serialize-error";

import {
  type MessengerMessage,
  type MessengerResponse,
  type PublicMethod,
  type PublicMethodWithTarget,
  type Options,
  type AnyTarget,
  type PageTarget,
  type LooseTarget,
} from "./types.js";
import {
  isObject,
  MessengerError,
  ExtensionNotFoundError,
  __webextMessenger,
} from "./shared.js";
import { log } from "./logging.js";
import { type Promisable, type SetReturnType } from "type-fest";
import { handlers } from "./handlers.js";
import { events } from "./events.js";

const _errorNonExistingTarget =
  "Could not establish connection. Receiving end does not exist.";

const _errorTargetClosedEarly =
  "A listener indicated an asynchronous response by returning true, but the message channel closed before a response was received";

export const errorTargetClosedEarly =
  "The target was closed before receiving a response";
export const errorTabDoesntExist = "The tab doesn't exist";
export const errorTabWasDiscarded = "The tab was discarded";

const errorExtensionNotFound =
  "Extension $ID is not installed or externally connectable";

function isMessengerResponse(response: unknown): response is MessengerResponse {
  return isObject(response) && response["__webextMessenger"] === true;
}

function attemptLog(attemptCount: number): string {
  return attemptCount > 1 ? `(try: ${attemptCount})` : "";
}

function wasContextInvalidated() {
  return !chrome.runtime?.id;
}

function getErrorMessage(error: unknown): string | undefined {
  if (error && typeof error === "object" && "message" in error) {
    return String(error.message);
  }

  return undefined;
}

function shouldRetryError(
  error: unknown,
  target: LooseTarget,
): boolean {
  const message = getErrorMessage(error);
  
  // Don't retry sending to the background page unless it really hasn't loaded yet
  if (target.page !== "background" && error instanceof MessengerError) {
    return true;
  }
  
  // Page or its content script not yet loaded
  if (message === _errorNonExistingTarget) {
    return true;
  }
  
  // `registerMethods` not yet loaded
  if (message?.startsWith("No handlers registered in ")) {
    return true;
  }
  
  return false;
}

function makeMessage(
  type: keyof MessengerMethods,
  args: unknown[],
  target: AnyTarget,
  options: Options,
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
  { seq, isNotification, retry }: Options,
  target: LooseTarget,
  sendMessage: (attempt: number) => Promise<unknown>,
): Promise<unknown> | void {
  if (!isNotification) {
    return manageMessage(type, target, seq!, retry ?? true, sendMessage);
  }

  void sendMessage(1).catch((error: unknown) => {
    log.debug(type, seq, "notification failed", { error });
  });
}

async function manageMessage(
  type: string,
  target: LooseTarget,
  seq: number,
  retry: boolean,
  sendMessage: (attempt: number) => Promise<unknown>,
): Promise<unknown> {
  const startTime = Date.now();
  const maxRetryTime = 4000;
  const minTimeout = 100;
  const factor = 1.3;
  let attemptNumber = 1;
  let currentTimeout = minTimeout;

  // eslint-disable-next-line no-constant-condition -- Intentional retry loop with break conditions
  while (true) {
    try {
      // eslint-disable-next-line no-await-in-loop -- Necessary for retry logic
      const response = await sendMessage(attemptNumber);

      if (isMessengerResponse(response)) {
        if ("error" in response) {
          log.debug(type, seq, "↘️ replied with error", response.error);
          throw deserializeError(response.error);
        }

        log.debug(type, seq, "↘️ replied successfully", response.value);
        return response.value;
      }

      // If no one answers, `response` will be `undefined`
      // If the target does not have any `onMessage` listener at all, it will throw
      // Possible:
      // - Any target exists and has onMessage handler, but never handled the message
      // - Extension page exists and has Messenger, but never handled the message (Messenger in Runtime ignores messages when the target isn't found)
      // Not possible:
      // - Tab exists and has Messenger, but never handled the message (Messenger in CS always handles messages)
      // - Any target exists, but Messenger didn't have the specific Type handler (The receiving Messenger will throw an error)
      // - No targets exist (the browser immediately throws "Could not establish connection. Receiving end does not exist.")
      if (response === undefined) {
        if ("page" in target) {
          throw new MessengerError(
            `The target ${JSON.stringify(target)} for ${type} was not found`,
          );
        }

        throw new MessengerError(
          `Messenger was not available in the target ${JSON.stringify(
            target,
          )} for ${type}`,
        );
      }

      // Possible:
      // - Non-Messenger handler responded
      throw new MessengerError(
        `Conflict: The message ${type} was handled by a third-party listener`,
      );
    } catch (error: unknown) {
      const errorMessage = getErrorMessage(error);
      
      events.dispatchEvent(
        new CustomEvent("failed-attempt", {
          detail: {
            type,
            seq,
            target,
            error,
            attemptCount: attemptNumber,
          },
        }),
      );

      // Check for non-retryable errors
      if ("extensionId" in target && errorMessage === _errorNonExistingTarget) {
        throw new ExtensionNotFoundError(
          errorExtensionNotFound.replace("$ID", target.extensionId!),
        );
      }

      if (isExtensionContext() && wasContextInvalidated()) {
        throw new Error("Extension context invalidated.");
      }

      if (errorMessage === _errorTargetClosedEarly) {
        throw new Error(errorTargetClosedEarly);
      }

      if (!shouldRetryError(error, target)) {
        throw error;
      }

      // Check if tab is still valid
      if (chrome.tabs && typeof target.tabId === "number") {
        try {
          // eslint-disable-next-line no-await-in-loop -- Necessary to check tab status during retry
          const tabInfo = await chrome.tabs.get(target.tabId);
          if (tabInfo.discarded) {
            throw new Error(errorTabWasDiscarded);
          }
        } catch {
          throw new Error(errorTabDoesntExist);
        }
      }

      // Check if we should stop retrying
      const elapsedTime = Date.now() - startTime;
      if (!retry || (elapsedTime >= maxRetryTime && attemptNumber > 1)) {
        if (errorMessage === _errorNonExistingTarget) {
          throw new MessengerError(
            `The target ${JSON.stringify(target)} for ${type} was not found`,
          );
        }

        events.dispatchEvent(
          new CustomEvent("attempts-exhausted", {
            detail: { type, seq, target, error },
          }),
        );

        throw error;
      }

      log.debug(type, seq, "will retry. Attempt", attemptNumber);

      // Wait before retrying with exponential backoff
      const waitTime = currentTimeout;
      // eslint-disable-next-line no-await-in-loop -- Necessary for retry delay
      await new Promise<void>((resolve) => {
        setTimeout(resolve, waitTime);
      });
      currentTimeout = Math.floor(currentTimeout * factor);
      attemptNumber++;
    }
  }
}

// Not a UID nor a truly global sequence. Signal / console noise compromise.
// The time part is a pseudo-random number between 0 and 99 that helps visually
// group messages from the same context. Keeping it a number also gives it a different
// color in the console log.
// Example log when seen in the background page:
// Tab 1 sends: 33000, 33001, 33002
// Tab 2 sends: 12000, 12001, 12002
let globalSeq = (Date.now() % 100) * 10_000;

function messenger<
  Type extends keyof MessengerMethods,
  Method extends MessengerMethods[Type],
>(
  type: Type,
  options: { isNotification: true },
  target: AnyTarget,
  ...args: Parameters<Method>
): void;
function messenger<
  Type extends keyof MessengerMethods,
  Method extends MessengerMethods[Type],
  ReturnValue extends Promise<ReturnType<Method>>,
>(
  type: Type,
  options: Options,
  target: AnyTarget,
  ...args: Parameters<Method>
): ReturnValue;
function messenger<
  Type extends keyof MessengerMethods,
  Method extends MessengerMethods[Type],
  ReturnValue extends Promise<ReturnType<Method>>,
>(
  type: Type,
  options: Options,
  target: AnyTarget,
  ...args: Parameters<Method>
): ReturnValue | void {
  options.seq = globalSeq++;
  const { seq } = options;

  if ("extensionId" in target) {
    if (!globalThis.chrome?.runtime?.sendMessage) {
      throw new ExtensionNotFoundError(
        errorExtensionNotFound.replace("$ID", target.extensionId),
      );
    }

    const sendMessage = async (attemptCount: number) => {
      log.debug(
        type,
        seq,
        "↗️ sending message to extension",
        attemptLog(attemptCount),
      );
      return chrome.runtime.sendMessage(
        target.extensionId,
        makeMessage(type, args, target, options),
      );
    };

    return manageConnection(type, options, target, sendMessage) as ReturnValue;
  }

  // Message goes to extension page
  if ("page" in target) {
    if (target.page === "background" && isBackground()) {
      const handler = handlers.get(type);
      if (handler) {
        log.warn(type, seq, "is being handled locally");
        return handler.apply({ trace: [] }, args) as ReturnValue;
      }

      throw new MessengerError("No handler registered locally for " + type);
    }

    const sendMessage = async (attemptCount: number) => {
      log.debug(
        type,
        seq,
        "↗️ sending message to runtime",
        attemptLog(attemptCount),
      );
      return chrome.runtime.sendMessage(
        makeMessage(type, args, target, options),
      );
    };

    return manageConnection(type, options, target, sendMessage) as ReturnValue;
  }

  // Contexts without direct Tab access must go through background
  if (!chrome.tabs) {
    return manageConnection(
      type,
      options,
      target,
      async (attemptCount: number) => {
        log.debug(
          type,
          seq,
          "↗️ sending message to runtime",
          attemptLog(attemptCount),
        );
        return chrome.runtime.sendMessage(
          makeMessage(type, args, target, options),
        );
      },
    ) as ReturnValue;
  }

  // `frameId` must be specified. If missing, the message is sent to every frame
  const { tabId, frameId = 0 } = target;

  // Message tab directly
  return manageConnection(
    type,
    options,
    target,
    async (attemptCount: number) => {
      log.debug(
        type,
        seq,
        "↗️ sending message to tab",
        tabId,
        "frame",
        frameId,
        attemptLog(attemptCount),
      );
      return chrome.tabs.sendMessage(
        tabId,
        makeMessage(type, args, target, options),
        frameId === "allFrames"
          ? {}
          : {
              frameId,
            },
      );
    },
  ) as ReturnValue;
}

function getMethod<
  Type extends keyof MessengerMethods,
  Method extends MessengerMethods[Type],
  PublicMethodType extends PublicMethod<Method>,
>(type: Type, target: Promisable<AnyTarget>): PublicMethodType;
function getMethod<
  Type extends keyof MessengerMethods,
  Method extends MessengerMethods[Type],
  PublicMethodWithDynamicTarget extends PublicMethodWithTarget<Method>,
>(type: Type): PublicMethodWithDynamicTarget;
function getMethod<
  Type extends keyof MessengerMethods,
  Method extends MessengerMethods[Type],
  PublicMethodType extends PublicMethod<Method>,
  PublicMethodWithDynamicTarget extends PublicMethodWithTarget<Method>,
>(
  type: Type,
  target?: Promisable<AnyTarget>,
): PublicMethodType | PublicMethodWithDynamicTarget {
  if (!target) {
    return messenger.bind(undefined, type, {}) as PublicMethodWithDynamicTarget;
  }

  return (async (...args: Parameters<Method>) =>
    messenger(type, {}, await target, ...args)) as PublicMethodType;
}

function getNotifier<
  Type extends keyof MessengerMethods,
  Method extends MessengerMethods[Type],
  PublicMethodType extends SetReturnType<PublicMethod<Method>, void>,
>(type: Type, target: Promisable<AnyTarget>): PublicMethodType;
function getNotifier<
  Type extends keyof MessengerMethods,
  Method extends MessengerMethods[Type],
  PublicMethodWithDynamicTarget extends SetReturnType<
    PublicMethodWithTarget<Method>,
    void
  >,
>(type: Type): PublicMethodWithDynamicTarget;
function getNotifier<
  Type extends keyof MessengerMethods,
  Method extends MessengerMethods[Type],
  PublicMethodType extends SetReturnType<PublicMethod<Method>, void>,
  PublicMethodWithDynamicTarget extends SetReturnType<
    PublicMethodWithTarget<Method>,
    void
  >,
>(
  type: Type,
  target?: Promisable<AnyTarget>,
): PublicMethodType | PublicMethodWithDynamicTarget {
  const options = { isNotification: true };
  if (!target) {
    // @ts-expect-error `bind` types are junk
    return messenger.bind(
      undefined,
      type,
      options,
    ) as PublicMethodWithDynamicTarget;
  }

  return ((...args: Parameters<Method>) => {
    // Async wrapper needed to use `await` while preserving a non-Promise return type
    (async () => messenger(type, options, await target, ...args))();
  }) as PublicMethodType;
}

export { messenger, getMethod, getNotifier };
export const backgroundTarget: PageTarget = { page: "background" };
