import { isBackgroundPage } from "webext-detect-page";
import { registerMethods } from "../../index";

import { sum } from "./background/sum";
import { throws } from "./background/throws";
import { sumIfMeta } from "./background/sumIfMeta";
import { getExtensionId } from "./background/getExtensionId";
import { backgroundOnly } from "./background/backgroundOnly";
import { notRegistered } from "./background/notRegistered";
import { getSelf } from "./background/getSelf";

declare global {
  // TODO: This interface can't actually guarantee that every type has a Method
  // Adding an index signature will break MessengerMethods’s usage, because any key
  // will just return Method even if not set.
  interface MessengerMethods {
    sum: typeof sum;
    throws: typeof throws;
    sumIfMeta: typeof sumIfMeta;
    notRegistered: typeof notRegistered;
    getExtensionId: typeof getExtensionId;
    backgroundOnly: typeof backgroundOnly;
    getSelf: typeof getSelf;
  }
}

if (!isBackgroundPage()) {
  throw new Error(
    "This file must only be run in the background page, which is the receiving eng"
  );
}

registerMethods({
  backgroundOnly,
  getExtensionId,
  sum,
  sumIfMeta,
  throws,
  getSelf,
});
