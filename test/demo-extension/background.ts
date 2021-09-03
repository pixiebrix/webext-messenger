import { isBackgroundPage } from "webext-detect-page";
import { registerMethod } from "../../index";

import { _sum } from "./background/sum";
import { _throws } from "./background/throws";
import { _sumIfMeta } from "./background/sumIfMeta";
import { _getExtensionId } from "./background/getExtensionId";
import { _backgroundOnly } from "./background/backgroundOnly";

if (!isBackgroundPage()) {
  throw new Error(
    "This file must only be run in the background page, which is the receiving eng"
  );
}

registerMethod("backgroundOnly", _backgroundOnly);
registerMethod("getExtensionId", _getExtensionId);
registerMethod("sum", _sum);
registerMethod("sumIfMeta", _sumIfMeta);
registerMethod("throws", _throws);
