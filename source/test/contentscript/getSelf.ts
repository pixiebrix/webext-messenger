import { MessengerMeta } from "../..";

export async function getSelf(
  this: MessengerMeta
): Promise<browser.runtime.MessageSender | undefined> {
  return this.trace[0];
}
