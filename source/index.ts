export { registerMethods } from "./receiver";
export { getContentScriptMethod, getMethod } from "./sender";
export { MessengerMeta, NamedTarget, Target } from "./types";
export { registerTarget } from "./namedTargets";
import { initTargets } from "./namedTargets";

initTargets();
