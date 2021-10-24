import { isBackgroundPage } from "webext-detect-page";
import { getMethod, MessengerMeta, registerMethods, Target } from ".";

declare global {
  interface MessengerMethods {
    __webextMessengerTargetRegistration: typeof _registerTarget;
  }
}

// TODO: Remove targets after tab closes to avoid "memory leaks"
export const targets = new Map<string, Target>();

/** Register the current context so that it can be targeted with a name */
export const registerTarget = getMethod("__webextMessengerTargetRegistration");

export function _registerTarget(this: MessengerMeta, name: string): void {
  const sender = this.trace[0]!;
  const tabId = sender.tab!.id!;
  const { frameId } = sender;
  targets.set(`${tabId}%${name}`, {
    tabId,
    frameId,
  });

  console.debug(`Messenger: Target "${name}" registered for tab ${tabId}`);
}

if (isBackgroundPage()) {
  registerMethods({
    __webextMessengerTargetRegistration: _registerTarget,
  });
}
