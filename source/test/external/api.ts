import { getMethod, getNotifier } from "webext-messenger";

export const getPlatformInfo = getMethod("getPlatformInfo");
export const getSelfExternal = getMethod("getSelfExternal");

// Not allowed via `allowExternalUse`, stolen from the regular background API
export const sum = getMethod("sum");
export const notRegisteredNotification = getNotifier("notRegistered");
