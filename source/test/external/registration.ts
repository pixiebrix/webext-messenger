import { isBackground } from "webext-detect";
import { allowExternalUse, registerMethods } from "webext-messenger";

import { getPlatformInfo } from "./getPlatformInfo.js";
import { getSelfExternal } from "./getSelfExternal.js";

declare global {
  interface MessengerMethods {
    getSelfExternal: typeof getSelfExternal;
    getPlatformInfo: typeof getPlatformInfo;
  }
}

if (!isBackground()) {
  throw new Error(
    "This file must only be run in the background page, which is the receiving end",
  );
}

registerMethods({
  getSelfExternal,
  getPlatformInfo,
});

allowExternalUse("getSelfExternal", "getPlatformInfo");
