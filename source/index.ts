import { registerTarget, _registerTarget } from "./namedTargets";
import { registerMethods } from "./receiver";
import { getContentScriptMethod, getMethod } from "./sender";
import { MessengerMeta, Method, NamedTarget, Target } from "./types";

export { MessengerMeta, Target, NamedTarget };

export const errorNonExistingTarget =
  "Could not establish connection. Receiving end does not exist.";

// The global interface is used to declare the types of the methods.
// This "empty" declaration helps the local code understand what
// `MessengerMethods[string]` may look like. Do not use `Record<string, Method>`
// because an index signature would allow any string to return Method and
// it would make `getMethod` too loose.
declare global {
  interface MessengerMethods {
    _: Method;
    __webextMessengerTargetRegistration: typeof _registerTarget;
  }
}

export { getMethod, getContentScriptMethod, registerMethods, registerTarget };
