import { Contract } from "../../../index";

export const sumifMetaContract: Contract<typeof sumIfMeta> = {
  type: "sumIfMeta",
};
export async function sumIfMeta(
  this: browser.runtime.MessageSender,
  ...addends: number[]
): Promise<number> {
  if (this.tab?.url) {
    return addends.reduce((a, b) => a + b);
  }

  throw new Error("Wrong sender");
}
