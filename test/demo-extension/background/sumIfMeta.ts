import { MessengerMeta } from "../../../index";

export async function sumIfMeta(
  this: MessengerMeta,
  ...addends: number[]
): Promise<number> {
  if (this.tab?.url) {
    return addends.reduce((a, b) => a + b);
  }

  throw new Error("Wrong sender");
}
