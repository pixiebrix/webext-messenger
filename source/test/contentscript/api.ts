import { getNotifier, getMethod } from "../..";

export const getPageTitle = getMethod("getPageTitle");
export const getPageTitleNotification = getNotifier("getPageTitle"); // Test-only; Notifications can't be getters
export const setPageTitle = getMethod("setPageTitle");
export const closeSelf = getMethod("closeSelf");
export const sumIfMeta = getMethod("sumIfMeta");
export const contentScriptOnly = getMethod("contentScriptOnly");
export const throws = getMethod("throws");
export const notRegistered = getMethod("notRegistered");
export const notRegisteredNotification = getNotifier("notRegistered");
export const getSelf = getMethod("getSelf");
export const getTrace = getMethod("getTrace");
