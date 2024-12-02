import {
  getContextName,
  isBackground,
  isExtensionContext,
  isOffscreenDocument,
} from "webext-detect";
import { messenger } from "./sender.js";
import { registerMethods } from "./receiver.js";
import {
  type AnyTarget,
  type KnownTarget,
  type TopLevelFrame,
  type MessengerMeta,
  type FrameTarget,
} from "./types.js";
import { MessengerError, once } from "./shared.js";
import { pEvent } from "p-event";

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
export const thisTarget: KnownTarget = (() => {
  if (isBackground()) return { page: "background" };
  if (isOffscreenDocument()) return { page: "offscreen" };
  return {
    get page(): string {
      // Extension pages have relative URLs to simplify comparison
      const origin = location.protocol.startsWith("http")
        ? location.origin
        : "";

      // Don't use the hash
      return origin + location.pathname + location.search;
    },
  };
})();

let tabDataStatus: "needed" | "pending" | "received" | "not-needed" | "error" =
  // Exclude contexts that don't have a tab associated to them
  isBackground() || isOffscreenDocument() ? "not-needed" : "needed";

export function getTabDataStatus(): typeof tabDataStatus {
  return tabDataStatus;
}

const storeTabData = once(async () => {
  if (tabDataStatus !== "needed") {
    return;
  }

  // If the page is prerendering, wait for the change to be able to get the tab data so the frameId is correct
  // https://developer.mozilla.org/en-US/docs/Web/API/Document/prerenderingchange_event
  if ("prerendering" in document && Boolean(document.prerendering)) {
    await pEvent(document, "prerenderingchange");
  }

  try {
    tabDataStatus = "pending";
    Object.assign(
      thisTarget,
      await messenger("__getTabData", {}, { page: "any" }),
    );
    tabDataStatus = "received";
  } catch (error: unknown) {
    tabDataStatus = "error";
    throw new MessengerError(
      "Tab registration failed. This page won’t be able to receive messages that require tab information",
      { cause: error },
    );
  }
});

export function __getTabData(this: MessengerMeta): AnyTarget {
  return { tabId: this.trace[0]?.tab?.id, frameId: this.trace[0]?.frameId };
}

// TODO: Add tests
export async function getThisFrame(): Promise<FrameTarget> {
  await storeTabData(); // It should already have been called but we still need to await it

  const { tabId, frameId } = thisTarget;

  if (typeof tabId !== "number" || typeof frameId !== "number") {
    let moreInfo = "(error retrieving context information)";
    try {
      moreInfo = `(context: ${getContextName()}, url: ${
        globalThis.location?.href
      })`;
    } catch {}

    throw new TypeError(`This target is not in a frame ${moreInfo}`);
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
    // TODO: Use Error#cause after https://bugs.chromium.org/p/chromium/issues/detail?id=1211260
    console.log(
      globalThis.__webextMessenger.replace(/^Error/, "webext-messenger"),
    );
    console.error(
      "webext-messenger: Duplicate execution. This is a fatal error.\nhttps://github.com/pixiebrix/webext-messenger/issues/88",
    );
    return;
  }

  // Use Error to capture the stack and make it easier to find the cause
  globalThis.__webextMessenger = new Error("First execution").stack!;
  if (isExtensionContext()) {
    // Only `runtime` pages can handle this message but I can't remove it because its listener
    // also serves the purpose of throwing a specific error when no methods have been registered.
    // https://github.com/pixiebrix/webext-messenger/pull/80
    registerMethods({ __getTabData });

    // `getTabInformation` includes per-context exclusion logic
    void storeTabData();
  }
}
