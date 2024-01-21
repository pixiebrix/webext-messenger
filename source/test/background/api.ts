import { getMethod, getNotifier, backgroundTarget } from "webext-messenger";

// Dog-fooding, needed to run the tests
export const openTab = getMethod("openTab", backgroundTarget);
export const closeTab = getMethod("closeTab", backgroundTarget);
export const createTargets = getMethod("createTargets", backgroundTarget);
export const ensureScripts = getMethod("ensureScripts", backgroundTarget);

export const sum = getMethod("sum", backgroundTarget);
export const throws = getMethod("throws", backgroundTarget);
export const sumIfMeta = getMethod("sumIfMeta", backgroundTarget);
export const notRegistered = getMethod("notRegistered", backgroundTarget);
export const notRegisteredNotification = getNotifier(
  "notRegistered",
  backgroundTarget
);
export const getExtensionId = getMethod("getExtensionId", backgroundTarget);
export const backgroundOnly = getMethod("backgroundOnly", backgroundTarget);
export const getSelf = getMethod("getSelf", backgroundTarget);
