import { type MessengerMeta } from "webext-messenger";

export async function getSelfExternal(
  this: MessengerMeta,
): Promise<{ approvedForExternalUse: chrome.runtime.MessageSender }> {
  return { approvedForExternalUse: this.trace[0]! };
}
