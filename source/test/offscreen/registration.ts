import { isOffscreenDocument } from "webext-detect";
import { registerMethods } from "webext-messenger";

import { addFrame } from "./addFrame.js";
import { getLocation } from "./getLocation.js";
import { getTrace } from "./getTrace.js";
import { evalScript } from "./eval.js";

declare global {
  interface MessengerMethods {
    addFrame: typeof addFrame;
    getLocation: typeof getLocation;
    getTrace: typeof getTrace;
    eval: typeof evalScript;
  }
}

if (!isOffscreenDocument()) {
  throw new Error(
    "This file must only be run in the offscreen document, which is the receiving end"
  );
}

registerMethods({
  addFrame,
  getLocation,
  getTrace,
  eval: evalScript,
});
