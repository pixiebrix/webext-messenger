import {
  isBackground,
  isContentScript,
  isExtensionContext,
} from "webext-detect-page";
import { messenger } from "./sender.js";
import { registerMethods } from "./receiver.js";
import { AnyTarget, Message, MessengerMeta, Sender } from "./types.js";
import { debug, MessengerError } from "./shared.js";
import { Entries } from "type-fest";

// Soft warning: Race conditions are possible.
// This CANNOT be awaited because waiting for it means "I will handle the message."
// If a message is received before this is ready, it will just have to be ignored.
const thisTarget: AnyTarget = isBackground()
  ? { page: "background" }
  : {
      get page(): string {
        return location.pathname + location.search;
      },
    };

function compareTargets(to: AnyTarget, thisTarget: AnyTarget): boolean {
  for (const [key, value] of Object.entries(to) as Entries<typeof to>) {
    if (thisTarget[key] === value) {
      continue;
    }

    if (key !== "page") {
      return false;
    }

    const toUrl = new URL(to.page!, location.origin);
    const thisUrl = new URL(thisTarget.page!, location.origin);
    if (toUrl.pathname !== thisUrl.pathname) {
      return false;
    }

    for (const [parameterKey, parameterValue] of toUrl.searchParams) {
      if (thisUrl.searchParams.get(parameterKey) !== parameterValue) {
        return false;
      }
    }
  }

  return true;
}

// TODO: Test this in Jest, outside the browser
export function getActionForMessage(
  from: Sender,
  message: Message
): "respond" | "forward" | "ignore" {
  // Clone object because we're editing it
  const to: AnyTarget = { ...message.target };
  if (to.page === "any") {
    return "respond";
  }

  // Content scripts only receive messages that are meant for them. In the future
  // they'll also forward them, but that still means they need to be handled here.
  if (isContentScript()) {
    return "respond";
  }

  // We're in an extension page, but the target is not one.
  if (!to.page) {
    return "forward";
  }

  // Set "this" tab to the current tabId
  if (to.tabId === "this" && thisTarget.tabId === from.tab?.id) {
    to.tabId = thisTarget.tabId;
  }

  // Every `target` key must match `thisTarget`
  const isThisTarget = compareTargets(to, thisTarget);

  if (!isThisTarget) {
    debug(message.type, "🤫 ignored due to target mismatch", {
      requestedTarget: to,
      thisTarget,
      tabInfoStatus,
    });
  }

  return isThisTarget ? "respond" : "ignore";
}

let tabInfoStatus: "needed" | "pending" | "done" | "error" =
  // The background page already has it
  isBackground() ||
  // Same as above: content scripts don't receive broadcasts (yet)
  isContentScript()
    ? "done"
    : "needed";
async function getTabInformation() {
  if (tabInfoStatus !== "needed") {
    return;
  }

  try {
    tabInfoStatus = "pending";
    Object.assign(thisTarget, {
      ...(await messenger("__getTabData", {}, { page: "any" })),
    });
    tabInfoStatus = "done";
  } catch (error: unknown) {
    tabInfoStatus = "error";
    throw new MessengerError(
      "Tab registration failed. This page won’t be able to receive messages that require tab information",
      // @ts-expect-error TODO: update lib to accept Error#cause
      { cause: error }
    );
  }
}

export function __getTabData(this: MessengerMeta): AnyTarget {
  return { tabId: this.trace[0]?.tab?.id, frameId: this.trace[0]?.frameId };
}

export function initPrivateApi(): void {
  if (isExtensionContext()) {
    // Only `runtime` pages can handle this message but I can't remove it  because its listener
    // also serves the purpose of throwing a specific error when no methods have been registered.
    // https://github.com/pixiebrix/webext-messenger/pull/80
    registerMethods({ __getTabData });

    // Already includes per-context exclusion logic
    void getTabInformation();
  }
}
