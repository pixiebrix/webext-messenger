import { isContentScript } from "webext-detect-page";
import { registerMethods } from "../..";

import { getPageTitle } from "./getPageTitle";
import { setPageTitle } from "./setPageTitle";
import { closeSelf } from "./closeSelf";
import { sumIfMeta } from "./sumIfMeta";
import { contentScriptOnly } from "./contentScriptOnly";
import { throws } from "./throws";
import { notRegistered } from "./notRegistered";
import { getSelf } from "./getSelf";

declare global {
  interface MessengerMethods {
    getPageTitle: typeof getPageTitle;
    setPageTitle: typeof setPageTitle;
    closeSelf: typeof closeSelf;
    sumIfMeta: typeof sumIfMeta;
    contentScriptOnly: typeof contentScriptOnly;
    throws: typeof throws;
    notRegistered: typeof notRegistered;
    getSelf: typeof getSelf;
  }
}

if (!isContentScript() && location.pathname !== "/iframe.html") {
  throw new Error(
    "This file must only be run in the content script, which is the receiving end"
  );
}

registerMethods({
  getPageTitle,
  setPageTitle,
  closeSelf,
  sumIfMeta,
  contentScriptOnly,
  throws,
  getSelf,
});
