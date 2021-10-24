import { MessengerMeta } from "../../../source";

export async function getSelf(
  this: MessengerMeta
): Promise<browser.runtime.MessageSender | undefined> {
  return this.trace[0];
}
