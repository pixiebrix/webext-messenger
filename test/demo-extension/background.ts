import { isBackgroundPage } from "webext-detect-page";
import {
  sum,
  throws,
  sumIfMeta,
  getExtensionId,
  backgroundOnly,
} from "./background/api";
import { registerMethods } from "../../index";

if (!isBackgroundPage()) {
  throw new Error(
    "This file must only be run in the background page, which is the receiving eng"
  );
}

registerMethods(backgroundOnly, getExtensionId, sum, sumIfMeta, throws);
