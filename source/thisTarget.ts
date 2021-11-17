import { isBackgroundPage, isExtensionContext } from "webext-detect-page";
import { messenger } from "./index.js";
import { registerMethods } from "./receiver";
import { Target, PageTarget, MessengerMeta } from "./types.js";
import { debug } from "./shared.js";

// Soft warning: Race conditions are possible.
// This CANNOT be awaited because waiting for it means "I will handle the message."
// If a message is received before this is ready, it will just have to be ignored.
let thisTarget: Partial<Target & PageTarget> | undefined;

export function isThisTarget(target: Target | PageTarget): boolean | undefined {
  // @ts-expect-error Optional properties
  if (target.page === "any") {
    return true;
  }

  if (!thisTarget) {
    console.warn("A message was received before this context was ready");
    return;
  }

  // Every key must match
  for (const [key, value] of Object.entries(target)) {
    // @ts-expect-error Optional properties
    if (thisTarget[key] !== value) {
      debug("The message’s target is", target, "but this is", thisTarget);
      return false;
    }
  }

  return true;
}

export async function nameThisTarget() {
  if (!thisTarget) {
    thisTarget = await messenger("__getTabData", {}, { page: "any" });
    if (isExtensionContext()) {
      thisTarget.page = location.pathname;
    }
  }
}

function __getTabData(this: MessengerMeta): Target {
  return { tabId: this.trace[0]!.tab!.id!, frameId: this.trace[0]!.frameId };
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
