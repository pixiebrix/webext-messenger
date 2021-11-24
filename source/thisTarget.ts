import { isBackgroundPage, isContentScript } from "webext-detect-page";
import { messenger } from "./index";
import { registerMethods } from "./receiver.js";
import { Target, PageTarget, MessengerMeta } from "./types.js";
import { debug } from "./shared.js";

type AnyTarget = Partial<Target & PageTarget>;

// Soft warning: Race conditions are possible.
// This CANNOT be awaited because waiting for it means "I will handle the message."
// If a message is received before this is ready, it will just have to be ignored.
let thisTarget: AnyTarget | undefined;

//
export function getActionForMessage(
  target: AnyTarget
): "respond" | "forward" | "ignore" {
  if (target.page === "any") {
    return "respond";
  }

  // Content scripts only receive messages that are meant for them. In the future
  // they'll also forward them, but that still means they need to be handled here.
  if (isContentScript()) {
    return "respond";
  }

  // We're in an extension page, but the target is not one.
  if (!("page" in target)) {
    return "forward";
  }

  if (!thisTarget) {
    console.warn("A message was received before this context was ready");
    // If this *was* the target, then probably no one else answered
    return "ignore";
  }

  // Every `target` key must match `thisTarget`
  const isThisTarget = Object.entries(target).every(
    // @ts-expect-error Optional properties
    ([key, value]) => thisTarget[key] === value
  );

  if (!isThisTarget) {
    debug("The message’s target is", target, "but this is", thisTarget);
  }

  return isThisTarget ? "respond" : "ignore";
}

export async function nameThisTarget() {
  // Same as above: CS receives messages correctly
  if (!thisTarget && !isContentScript()) {
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
  if (isBackgroundPage()) {
    thisTarget = { page: "background" };
    registerMethods({ __getTabData });
  }
}
