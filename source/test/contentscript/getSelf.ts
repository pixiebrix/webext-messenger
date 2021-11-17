import { MessengerMeta, Sender } from "../..";

export async function getSelf(
  this: MessengerMeta
): Promise<Sender | undefined> {
  return this.trace[0];
}
