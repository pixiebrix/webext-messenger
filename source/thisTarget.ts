import {
  isBackground,
  isContentScript,
  isExtensionContext,
} from "webext-detect-page";
import { messenger } from "./sender.js";
import { registerMethods } from "./receiver.js";
import {
  type AnyTarget,
  type KnownTarget,
  type TopLevelFrame,
  type Message,
  type MessengerMeta,
  type Sender,
  type FrameTarget,
} from "./types.js";
import { MessengerError, once } from "./shared.js";
import { log } from "./logging.js";
import { type Entries } from "type-fest";

/**
 * @file This file exists because `runtime.sendMessage` acts as a broadcast to
 * all open extension pages, so the receiver needs a way to figure out if the
 * message was intended for them.
 *
 * If the requested target only includes a `page` (URL), then it can be determined
 * immediately. If the target also specifies a tab, like `{tabId: 1, page: '/sidebar.html'}`,
 * then the receiving target needs to fetch the tab information via `__getTabData`.
 *
 * `__getTabData` is called automatically when `webext-messenger` is imported in
 * a context that requires this logic (most extension:// pages).
 *
 * If a broadcast message with `tabId` target is received before `__getTabData` is "received",
 * the message will be ignored and it can be retried. If `__getTabData` somehow fails,
 * the target will forever ignore any messages that require the `tabId`. In that case,
 * an error would be thrown once and will be visible in the console, uncaught.
 *
 * Content scripts do not use this logic at all at the moment because they're
 * always targeted via `tabId/frameId` combo and `tabs.sendMessage`.
 */

// Soft warning: Race conditions are possible.
// This CANNOT be awaited because waiting for it means "I will handle the message."
// If a message is received before this is ready, it will just have to be ignored.
const thisTarget: KnownTarget = isBackground()
  ? { page: "background" }
  : {
      get page(): string {
        // Extension pages have relative URLs to simplify comparison
        const origin = location.protocol.startsWith("http")
          ? location.origin
          : "";

        // Don't use the hash
        return origin + location.pathname + location.search;
      },
    };

let tabDataStatus: "needed" | "pending" | "received" | "not-needed" | "error" =
  // The background page doesn't have a tab
  isBackground() ? "not-needed" : "needed";

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
    log.debug(message.type, "🤫 ignored due to target mismatch", {
      requestedTarget: to,
      thisTarget,
      tabDataStatus,
    });
  }

  return isThisTarget ? "respond" : "ignore";
}

const storeTabData = once(async () => {
  if (tabDataStatus !== "needed") {
    return;
  }

  try {
    tabDataStatus = "pending";
    Object.assign(thisTarget, {
      ...(await messenger("__getTabData", {}, { page: "any" })),
    });
    tabDataStatus = "received";
  } catch (error: unknown) {
    tabDataStatus = "error";
    throw new MessengerError(
      "Tab registration failed. This page won’t be able to receive messages that require tab information",
      { cause: error }
    );
  }
});

export function __getTabData(this: MessengerMeta): AnyTarget {
  return { tabId: this.trace[0]?.tab?.id, frameId: this.trace[0]?.frameId };
}

export async function getThisFrame(): Promise<FrameTarget> {
  await storeTabData(); // It should already have been called but we still need to await it

  const { tabId, frameId } = thisTarget;

  if (typeof tabId !== "number" || typeof frameId !== "number") {
    throw new TypeError("This target is not in a frame");
  }

  // Rebuild object to return exactly these two properties and nothing more
  return { tabId, frameId };
}

export async function getTopLevelFrame(): Promise<TopLevelFrame> {
  const { tabId } = await getThisFrame();
  return {
    tabId,
    frameId: 0,
  };
}

export function initPrivateApi(): void {
  // Improve DX by informing the developer that it's being loaded the wrong way
  // https://github.com/pixiebrix/webext-messenger/issues/88
  if (globalThis.__webextMessenger) {
    console.error(
      "webext-messenger has already been imported in this context. This is a fatal error.\nhttps://github.com/pixiebrix/webext-messenger/issues/88",
      {
        existing: globalThis.__webextMessenger,
        current: import.meta.url,
      }
    );
  }

  globalThis.__webextMessenger = import.meta.url;
  if (isExtensionContext()) {
    // Only `runtime` pages can handle this message but I can't remove it because its listener
    // also serves the purpose of throwing a specific error when no methods have been registered.
    // https://github.com/pixiebrix/webext-messenger/pull/80
    registerMethods({ __getTabData });

    // `getTabInformation` includes per-context exclusion logic
    void storeTabData();
  }
}
