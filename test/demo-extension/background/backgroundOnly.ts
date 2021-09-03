import { isBackgroundPage } from "webext-detect-page";

export async function _backgroundOnly(): Promise<true> {
  if (!isBackgroundPage()) {
    throw new Error("Wrong context");
  }

  return true;
}
