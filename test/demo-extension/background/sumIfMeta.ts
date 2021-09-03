import { getMethod, getRegistration } from "../../../index";

async function _sumIfMeta(
  this: browser.runtime.MessageSender,
  ...addends: number[]
): Promise<number> {
  if (this.tab?.url) {
    return addends.reduce((a, b) => a + b);
  }

  throw new Error("Wrong sender");
}

const name = "sumIfMeta";
export const sumIfMeta = getMethod<typeof _sumIfMeta>(name);
export const registerSumIfMeta = getRegistration(name, _sumIfMeta);
