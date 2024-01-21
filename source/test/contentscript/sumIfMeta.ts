import { type MessengerMeta } from "webext-messenger";

export async function sumIfMeta(
  this: MessengerMeta,
  ...addends: number[]
): Promise<number> {
  if (this.trace[0]?.id === chrome.runtime.id) {
    return addends.reduce((a, b) => a + b);
  }

  throw new Error("Wrong sender");
}
