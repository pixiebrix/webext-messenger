import {
  isBackgroundPage,
  isContentScript,
  isExtensionContext,
} from "webext-detect-page";
import { messenger } from "./sender.js";
import { registerMethods } from "./receiver.js";
import { MessengerMeta, Sender } from "./types.js";
import { debug } from "./shared.js";

interface AnyTarget {
  tabId?: number | "this";
  frameId?: number;
  page?: string;
}

// Soft warning: Race conditions are possible.
// This CANNOT be awaited because waiting for it means "I will handle the message."
// If a message is received before this is ready, it will just have to be ignored.
let thisTarget: AnyTarget | undefined;

export function getActionForMessage(
  from: Sender,
  { ...to }: AnyTarget // Clone object because we're editing it
): "respond" | "forward" | "ignore" {
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

  if (!thisTarget) {
    console.warn("A message was received before this context was ready");
    // If this *was* the target, then probably no one else answered
    return "ignore";
  }

  // If requests "this" tab, then set it to allow the next condition
  if (to.tabId === "this" && thisTarget.tabId === from.tab?.id) {
    to.tabId = thisTarget.tabId;
  }

  // Every `target` key must match `thisTarget`
  const isThisTarget = Object.entries(to).every(
    // @ts-expect-error Optional properties
    ([key, value]) => thisTarget[key] === value
  );

  if (!isThisTarget) {
    debug("The message’s target is", to, "but this is", thisTarget);
  }

  return isThisTarget ? "respond" : "ignore";
}

let nameRequested = false;
export async function nameThisTarget() {
  // Same as above: CS receives messages correctly
  if (!nameRequested && !thisTarget && !isContentScript()) {
    nameRequested = true;
    thisTarget = await messenger("__getTabData", {}, { page: "any" });
    thisTarget.page = location.pathname;
  }
}

function __getTabData(this: MessengerMeta): AnyTarget {
  return { tabId: this.trace[0]?.tab?.id, frameId: this.trace[0]?.frameId };
}

declare global {
  interface MessengerMethods {
    __getTabData: typeof __getTabData;
  }
}

export function initPrivateApi(): void {
  if (isExtensionContext()) {
    // Any context can handler this message
    registerMethods({ __getTabData });
  }

  if (isBackgroundPage()) {
    thisTarget = { page: "background" };
  }
}
