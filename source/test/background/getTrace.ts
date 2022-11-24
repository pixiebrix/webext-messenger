import { type MessengerMeta, type Sender } from "../../index.js";

export async function getTrace(this: MessengerMeta): Promise<Sender[]> {
  return this.trace;
}
