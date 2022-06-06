import { MessengerMeta, Sender } from "../../index.js";

export async function getTrace(this: MessengerMeta): Promise<Sender[]> {
  return this.trace;
}
