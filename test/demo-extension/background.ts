import { isBackgroundPage } from "webext-detect-page";
import { registerMethods } from "../../index";

import { sum } from "./background/sum";
import { throws } from "./background/throws";
import { sumIfMeta } from "./background/sumIfMeta";
import { getExtensionId } from "./background/getExtensionId";
import { backgroundOnly } from "./background/backgroundOnly";

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
});
