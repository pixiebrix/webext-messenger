import { MessengerMeta, Sender } from "../../index.js";

export async function getSelf(
  this: MessengerMeta
): Promise<Sender | undefined> {
  return this.trace[0];
}
