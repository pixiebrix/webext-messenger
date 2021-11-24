import { Runtime } from "webextension-polyfill";
import { MessengerMeta } from "../..";

export async function getSelf(
  this: MessengerMeta
): Promise<Runtime.MessageSender | undefined> {
  return this.trace[0];
}
