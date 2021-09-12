import { isContentScript } from "webext-detect-page";

export async function contentScriptOnly(): Promise<true> {
  if (!isContentScript()) {
    throw new Error("Wrong context");
  }

  return true;
}
