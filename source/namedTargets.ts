import { isBackgroundPage } from "webext-detect-page";
import { NamedTarget, Target, MessengerMeta } from "./types.js";
import { errorNonExistingTarget, getMethod } from "./sender.js";
import { registerMethods } from "./receiver.js";

declare global {
  interface MessengerMethods {
    __webextMessengerTargetRegistration: typeof _registerTarget;
  }
}

export function resolveNamedTarget(
  target: NamedTarget,
  sender?: browser.runtime.MessageSender
): Target {
  if (!isBackgroundPage()) {
    throw new Error(
      "Named targets can only be resolved in the background page"
    );
  }

  const {
    name,
    tabId = sender?.tab?.id, // If not specified, try to use the sender’s
  } = target;
  if (typeof tabId === "undefined") {
    throw new TypeError(
      `${errorNonExistingTarget} The tab ID was not specified nor it was automatically determinable.`
    );
  }

  const resolvedTarget = targets.get(`${tabId}%${name}`);
  if (!resolvedTarget) {
    throw new Error(
      `${errorNonExistingTarget} Target named ${name} not registered for tab ${tabId}.`
    );
  }

  return resolvedTarget;
}

// TODO: Remove targets after tab closes to avoid "memory leaks"
export const targets = new Map<string, Target>();

/** Register the current context so that it can be targeted with a name */
export const registerTarget = getMethod("__webextMessengerTargetRegistration");

function _registerTarget(this: MessengerMeta, name: string): void {
  const sender = this.trace[0]!;
  const tabId = sender.tab!.id!;
  const { frameId } = sender;
  targets.set(`${tabId}%${name}`, {
    tabId,
    frameId,
  });

  console.debug(`Messenger: Target "${name}" registered for tab ${tabId}`);
}

export function initTargets(): void {
  if (isBackgroundPage()) {
    registerMethods({
      __webextMessengerTargetRegistration: _registerTarget,
    });
  }
}
