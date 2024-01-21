import { type MessengerMeta, type Sender } from "webext-messenger";

export async function getTrace(this: MessengerMeta): Promise<Sender[]> {
  return this.trace;
}
