import { MessengerMeta } from "../../../index";

export async function getSelf(this: MessengerMeta): Promise<MessengerMeta> {
  return this;
}
