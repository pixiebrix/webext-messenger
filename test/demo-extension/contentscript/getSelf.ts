import { MessengerMeta } from "../../../index";

export async function getSelf(
  this: MessengerMeta
): Promise<browser.Runtime.MessageSender | undefined> {
  return this.trace[0];
}
