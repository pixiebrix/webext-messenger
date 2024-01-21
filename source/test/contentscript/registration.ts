import { isContentScript } from "webext-detect-page";
import { registerMethods } from "webext-messenger";

import { getPageTitle } from "./getPageTitle.js";
import { setPageTitle } from "./setPageTitle.js";
import { closeSelf } from "./closeSelf.js";
import { sumIfMeta } from "./sumIfMeta.js";
import { contentScriptOnly } from "./contentScriptOnly.js";
import { throws } from "./throws.js";
import { type notRegistered } from "./notRegistered.js";
import { getSelf } from "./getSelf.js";
import { sleep } from "./sleep.js";
import { getTrace } from "./getTrace.js";

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
    getTrace: typeof getTrace;
    sleep: typeof sleep;
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
  getTrace,
  sleep,
});
