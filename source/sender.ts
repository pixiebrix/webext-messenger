import pRetry from "p-retry";
import { isBackground } from "webext-detect-page";
import { deserializeError } from "serialize-error";

import {
  type MessengerMessage,
  type MessengerResponse,
  type PublicMethod,
  type PublicMethodWithTarget,
  type Options,
  type Target,
  type PageTarget,
  type AnyTarget,
} from "./types.js";
import { isObject, MessengerError, __webextMessenger } from "./shared.js";
import { log } from "./logging.js";
import { type Promisable, type SetReturnType } from "type-fest";
import { handlers } from "./handlers.js";
import { events } from "./events.js";

const _errorNonExistingTarget =
  "Could not establish connection. Receiving end does not exist.";

// https://github.com/mozilla/webextension-polyfill/issues/384
const _errorTargetClosedEarly =
  "A listener indicated an asynchronous response by returning true, but the message channel closed before a response was received";

export const errorTargetClosedEarly =
  "The target was closed before receiving a response";
export const errorTabDoesntExist = "The tab doesn't exist";
export const errorTabWasDiscarded = "The tab was discarded";

function isMessengerResponse(response: unknown): response is MessengerResponse {
  return isObject(response) && response["__webextMessenger"] === true;
}

function attemptLog(attemptCount: number): string {
  return attemptCount > 1 ? `(try: ${attemptCount})` : "";
}

function wasContextInvalidated() {
  return !chrome.runtime?.id;
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
  { seq, isNotification, retry }: Options,
  target: AnyTarget,
  sendMessage: (attempt: number) => Promise<unknown>
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
  target: AnyTarget,
  seq: number,
  retry: boolean,
  sendMessage: (attempt: number) => Promise<unknown>
): Promise<unknown> {
  // TODO: Split this up a bit because it's too long. Probably drop p-retry
  const response = await pRetry(
    async (attemptCount) => {
      const response = await sendMessage(attemptCount);

      if (isMessengerResponse(response)) {
        return response;
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
            `The target ${JSON.stringify(target)} for ${type} was not found`
          );
        }

        throw new MessengerError(
          `Messenger was not available in the target ${JSON.stringify(
            target
          )} for ${type}`
        );
      }

      // Possible:
      // - Non-Messenger handler responded
      throw new MessengerError(
        `Conflict: The message ${type} was handled by a third-party listener`
      );
    },
    {
      minTimeout: 100,
      factor: 1.3,
      // Do not set this to undefined or Infinity, it doesn't work the same way
      ...(retry ? {} : { retries: 0 }),
      maxRetryTime: 4000,
      async onFailedAttempt(error) {
        events.dispatchEvent(
          new CustomEvent("failed-attempt", {
            detail: {
              type,
              seq,
              target,
              error,
              attemptCount: error.attemptNumber,
            },
          })
        );

        if (wasContextInvalidated()) {
          // The error matches the native context invalidated error
          // *.sendMessage() might fail with a message-specific error that is less useful,
          // like "Sender closed without responding"
          throw new Error("Extension context invalidated.");
        }

        if (error.message === _errorTargetClosedEarly) {
          throw new Error(errorTargetClosedEarly);
        }

        if (
          !(
            // If NONE of these conditions is true, stop retrying
            // Don't retry sending to the background page unless it really hasn't loaded yet
            (
              (target.page !== "background" &&
                error instanceof MessengerError) ||
              // Page or its content script not yet loaded
              error.message === _errorNonExistingTarget ||
              // `registerMethods` not yet loaded
              String(error.message).startsWith("No handlers registered in ")
            )
          )
        ) {
          throw error;
        }

        if (browser.tabs && typeof target.tabId === "number") {
          try {
            const tabInfo = await browser.tabs.get(target.tabId);
            if (tabInfo.discarded) {
              throw new Error(errorTabWasDiscarded);
            }
          } catch {
            throw new Error(errorTabDoesntExist);
          }
        }

        log.debug(type, seq, "will retry. Attempt", error.attemptNumber);
      },
    }
  ).catch((error: Error) => {
    if (error?.message === _errorNonExistingTarget) {
      throw new MessengerError(
        `The target ${JSON.stringify(target)} for ${type} was not found`
      );
    }

    events.dispatchEvent(
      new CustomEvent("attempts-exhausted", {
        detail: { type, seq, target, error },
      })
    );

    throw error;
  });

  if ("error" in response) {
    log.debug(type, seq, "↘️ replied with error", response.error);
    throw deserializeError(response.error);
  }

  log.debug(type, seq, "↘️ replied successfully", response.value);
  return response.value;
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
  options.seq = globalSeq++;
  const { seq } = options;

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
        attemptLog(attemptCount)
      );
      return browser.runtime.sendMessage(
        makeMessage(type, args, target, options)
      );
    };

    return manageConnection(type, options, target, sendMessage) as ReturnValue;
  }

  // Contexts without direct Tab access must go through background
  if (!browser.tabs) {
    return manageConnection(
      type,
      options,
      target,
      async (attemptCount: number) => {
        log.debug(
          type,
          seq,
          "↗️ sending message to runtime",
          attemptLog(attemptCount)
        );
        return browser.runtime.sendMessage(
          makeMessage(type, args, target, options)
        );
      }
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
        attemptLog(attemptCount)
      );
      return browser.tabs.sendMessage(
        tabId,
        makeMessage(type, args, target, options),
        {
          frameId,
        }
      );
    }
  ) as ReturnValue;
}

function getMethod<
  Type extends keyof MessengerMethods,
  Method extends MessengerMethods[Type],
  PublicMethodType extends PublicMethod<Method>
>(type: Type, target: Promisable<Target | PageTarget>): PublicMethodType;
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
  target?: Promisable<Target | PageTarget>
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
  PublicMethodType extends SetReturnType<PublicMethod<Method>, void>
>(type: Type, target: Promisable<Target | PageTarget>): PublicMethodType;
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
  target?: Promisable<Target | PageTarget>
): PublicMethodType | PublicMethodWithDynamicTarget {
  const options = { isNotification: true };
  if (!target) {
    // @ts-expect-error `bind` types are junk
    return messenger.bind(
      undefined,
      type,
      options
    ) as PublicMethodWithDynamicTarget;
  }

  return ((...args: Parameters<Method>) => {
    // Async wrapper needed to use `await` while preserving a non-Promise return type
    (async () => messenger(type, options, await target, ...args))();
  }) as PublicMethodType;
}

export { messenger, getMethod, getNotifier };
export const backgroundTarget: PageTarget = { page: "background" };
