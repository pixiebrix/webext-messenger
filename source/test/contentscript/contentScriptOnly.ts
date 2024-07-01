import { isContentScript } from "webext-detect";

export async function contentScriptOnly(): Promise<true> {
  if (!isContentScript()) {
    throw new Error("Wrong context");
  }

  return true;
}
