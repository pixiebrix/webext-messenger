import { isBackgroundPage } from "webext-detect-page";
import { getMethod, getRegistration } from "../../../index";

async function _backgroundOnly(): Promise<true> {
  if (!isBackgroundPage()) {
    throw new Error("Wrong context");
  }

  return true;
}

const name = "backgroundOnly";
export const backgroundOnly = getMethod<typeof _backgroundOnly>(name);
export const registerBackgroundOnly = getRegistration(name, _backgroundOnly);
