import { isBackground } from "webext-detect-page";
import { registerMethods } from "../../index.js";

import { sum } from "./sum.js";
import { throws } from "./throws.js";
import { sumIfMeta } from "./sumIfMeta.js";
import { getExtensionId } from "./getExtensionId.js";
import { backgroundOnly } from "./backgroundOnly.js";
import { type notRegistered } from "./notRegistered.js";
import { getSelf } from "./getSelf.js";
import {
  openTab,
  createTargets,
  ensureScripts,
  closeTab,
} from "./testingApi.js";
import { getTrace } from "./getTrace.js";

declare global {
  // eslint-disable-next-line @typescript-eslint/consistent-type-definitions -- Interface required for declaration merging
  interface MessengerMethods {
    sum: typeof sum;
    throws: typeof throws;
    sumIfMeta: typeof sumIfMeta;
    notRegistered: typeof notRegistered;
    getExtensionId: typeof getExtensionId;
    backgroundOnly: typeof backgroundOnly;
    getSelf: typeof getSelf;
    getTrace: typeof getTrace;
    openTab: typeof openTab;
    createTargets: typeof createTargets;
    ensureScripts: typeof ensureScripts;
    closeTab: typeof closeTab;
  }
}

if (!isBackground()) {
  throw new Error(
    "This file must only be run in the background page, which is the receiving end"
  );
}

registerMethods({
  backgroundOnly,
  getExtensionId,
  sum,
  sumIfMeta,
  throws,
  getSelf,
  getTrace,
  openTab,
  createTargets,
  ensureScripts,
  closeTab,
});
