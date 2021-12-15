import { isBackground } from "webext-detect-page";

export async function backgroundOnly(): Promise<true> {
  if (!isBackground()) {
    throw new Error("Wrong context");
  }

  return true;
}
