import { MessengerMeta, Sender } from "../..";

export async function getTrace(this: MessengerMeta): Promise<Sender[]> {
  return this.trace;
}
