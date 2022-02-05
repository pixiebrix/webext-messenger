import {
  isBackground,
  isContentScript,
  isExtensionContext,
} from "webext-detect-page";
import { messenger } from "./sender.js";
import { registerMethods } from "./receiver.js";
import { AnyTarget, MessengerMeta, Sender } from "./types.js";
import { debug } from "./shared.js";
import { Entries } from "type-fest";

// Soft warning: Race conditions are possible.
// This CANNOT be awaited because waiting for it means "I will handle the message."
// If a message is received before this is ready, it will just have to be ignored.
let thisTarget: AnyTarget | undefined;

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

  // Set "this" tab to the current tabId
  if (to.tabId === "this" && thisTarget.tabId === from.tab?.id) {
    to.tabId = thisTarget.tabId;
  }

  // Every `target` key must match `thisTarget`
  const isThisTarget = compareTargets(to, thisTarget);

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
    thisTarget.page = location.pathname + location.search;
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
  if (isBackground()) {
    thisTarget = { page: "background" };
  }

  if (isExtensionContext()) {
    // Any context can handler this message
    registerMethods({ __getTabData });
  }
}
