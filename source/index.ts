export { registerMethods } from "./receiver.js";
export { getContentScriptMethod, getMethod } from "./sender.js";
export { MessengerMeta, NamedTarget, Target } from "./types.js";
export { registerTarget } from "./namedTargets.js";
import { initTargets } from "./namedTargets.js";

initTargets();
